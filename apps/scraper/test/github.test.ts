import type { Octokit } from '@octokit/rest';
import { describe, expect, it, vi } from 'vitest';
import { PriceFile, Product } from '@prysuil/shared';
import { GitHubIssuesNotifier } from '../src/notifiers/github';
import type { Alert } from '../src/notifiers/types';

function setup() {
  const request = () => vi.fn<(params: object) => Promise<object>>(async () => ({}));
  const issues = {
    create: vi.fn<(params: object) => Promise<object>>(async () => ({ data: { number: 42 } })),
    createComment: request(),
    addLabels: request(),
    removeLabel: vi.fn<(params: object) => Promise<object>>(async () => {
      throw Object.assign(new Error('Not Found'), { status: 404 });
    }),
    update: request(),
  };
  const octokit = { rest: { issues } } as unknown as Octokit;
  return { issues, notifier: new GitHubIssuesNotifier(octokit, 'owner/prysuil') };
}

function bodyOf(call: [object] | undefined): string {
  return (call?.[0] as { body: string }).body;
}

function drop(extra: Partial<PriceFile> = {}): Alert {
  const product = Product.parse({
    id: 'p1',
    url: 'https://shop.example/item',
    name: 'Headphones',
    shop: 'shop.example',
    targetPrice: 950,
    addedAt: '2026-10-01T00:00:00Z',
  });
  const priceFile = PriceFile.parse({
    productId: 'p1',
    imageUrl: 'https://shop.example/img.jpg',
    history: [
      { at: '2026-10-01T00:00:00Z', price: 1000 },
      { at: '2026-10-02T00:00:00Z', price: 900 },
    ],
    lastCheckedAt: '2026-10-02T00:00:00Z',
    ...extra,
  });
  return { kind: 'price-drop', product, priceFile, oldPrice: 1000, newPrice: 900 };
}

function cantRead(extra: Partial<PriceFile> = {}): Alert {
  const { product, priceFile } = drop({ lastError: 'HTTP 403', consecutiveFailures: 3, ...extra });
  return { kind: 'cant-read-price', product, priceFile };
}

describe('GitHubIssuesNotifier', () => {
  it('creates an issue on the first alert and stores its number', async () => {
    const { issues, notifier } = setup();
    const alert = drop();

    await notifier.send([alert]);

    expect(issues.create).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'owner',
        repo: 'prysuil',
        title: 'Price drop: Headphones',
        labels: ['price-drop'],
      }),
    );
    const body = bodyOf(issues.create.mock.calls[0]);
    expect(body).toContain('![](https://shop.example/img.jpg)');
    expect(body).toContain('Current price: R900');
    expect(body).toContain('Previous price: R1 000');
    expect(body).toContain('Change: -10%');
    expect(body).toContain('Target: R950');
    expect(body).toContain('Lowest seen: R900');
    expect(body).toContain('Tracking since: 2026-10-01');
    expect(body).toContain('[shop.example](https://shop.example/item)');
    expect(alert.priceFile.issueNumber).toBe(42);
  });

  it('comments on the existing issue for later alerts', async () => {
    const { issues, notifier } = setup();

    await notifier.send([drop({ issueNumber: 7 })]);

    expect(issues.create).not.toHaveBeenCalled();
    expect(issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 7, body: expect.stringContaining('R900') }),
    );
    expect(issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 7, labels: ['price-drop'] }),
    );
  });

  it('mentions the owner only when asked to', async () => {
    const { issues, notifier } = setup();

    await notifier.send([drop(), drop({ issueNumber: 7 })], { mentionOwner: true });
    await notifier.send([drop(), drop({ issueNumber: 7 })], { mentionOwner: false });

    expect(bodyOf(issues.create.mock.calls[0])).toContain('@owner');
    expect(bodyOf(issues.createComment.mock.calls[0])).toContain('@owner');
    expect(bodyOf(issues.create.mock.calls[1])).not.toContain('@owner');
    expect(bodyOf(issues.createComment.mock.calls[1])).not.toContain('@owner');
  });

  it('opens a scrape-error issue when the price cannot be read', async () => {
    const { issues, notifier } = setup();
    const alert = cantRead();

    await notifier.send([alert]);

    expect(issues.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Can't read price: Headphones",
        labels: ['scrape-error'],
      }),
    );
    const body = bodyOf(issues.create.mock.calls[0]);
    expect(body).toContain('HTTP 403');
    expect(body).toContain('use browser');
    expect(alert.priceFile.issueNumber).toBe(42);
  });

  it('comments and adds the scrape-error label on an existing issue', async () => {
    const { issues, notifier } = setup();

    await notifier.send([cantRead({ issueNumber: 7 })]);

    expect(issues.create).not.toHaveBeenCalled();
    expect(issues.createComment).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 7 }));
    expect(issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 7, labels: ['scrape-error'] }),
    );
  });

  it('removes the other kind label when an issue switches kind', async () => {
    const { issues, notifier } = setup();

    await notifier.send([drop({ issueNumber: 7 })]);

    expect(issues.removeLabel).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 7, name: 'scrape-error' }),
    );
  });

  it('does not fail when the other kind label was never set', async () => {
    const { notifier } = setup();

    await expect(notifier.send([drop({ issueNumber: 7 })])).resolves.toBeUndefined();
  });

  it('closes an issue with a final comment', async () => {
    const { issues, notifier } = setup();

    await notifier.closeIssue({ issueNumber: 7, reason: 'bought' });
    await notifier.closeIssue({ issueNumber: 8, reason: 'deleted' });

    expect(issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 7, body: 'Marked as bought, closing.' }),
    );
    expect(issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 8, body: 'Product removed from the list, closing.' }),
    );
    expect(issues.update).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 7, state: 'closed' }),
    );
    expect(issues.update).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 8, state: 'closed' }),
    );
  });

  it('throws when GitHub fails', async () => {
    const { issues, notifier } = setup();
    issues.create.mockRejectedValue(new Error('Bad credentials'));

    await expect(notifier.send([drop()])).rejects.toThrow('Bad credentials');
  });
});
