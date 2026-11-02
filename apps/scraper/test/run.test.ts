import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PriceFile, type Product } from '@prysuil/shared';
import type { IssueClose } from '../src/notifiers/github';
import type { Alert } from '../src/notifiers/types';
import { run } from '../src/run';

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'prysuil-run-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function writeProducts(products: Partial<Product>[]) {
  const full = products.map((product, i) => ({
    id: `p${i + 1}`,
    url: `https://shop${i + 1}.example/item`,
    shop: `shop${i + 1}.example`,
    addedAt: '2026-10-01T00:00:00Z',
    ...product,
  }));
  writeFileSync(
    join(dataDir, 'products.json'),
    JSON.stringify({ version: 1, currency: 'ZAR', products: full }),
  );
}

function writePrice(productId: string, prices: number[], extra: Partial<PriceFile> = {}) {
  mkdirSync(join(dataDir, 'prices'), { recursive: true });
  const file = {
    productId,
    history: prices.map((price, i) => ({ at: `2026-10-0${i + 1}T00:00:00Z`, price })),
    lastCheckedAt: '2026-10-20T00:00:00Z',
    ...extra,
  };
  writeFileSync(join(dataDir, 'prices', `${productId}.json`), JSON.stringify(file));
}

function readPrice(productId: string): PriceFile {
  return PriceFile.parse(
    JSON.parse(readFileSync(join(dataDir, 'prices', `${productId}.json`), 'utf8')),
  );
}

function page(price: number): string {
  return `<html><head>
    <title>Headphones</title>
    <meta property="product:price:amount" content="${price}">
    <meta property="product:price:currency" content="ZAR">
    <meta property="og:image" content="/img.jpg">
  </head></html>`;
}

function setup(load: (url: string) => Promise<string>) {
  const notifier = (name: string) => ({
    name,
    enabled: vi.fn(() => true),
    send: vi.fn<(alerts: Alert[]) => Promise<void>>(async () => {}),
  });
  return {
    dataDir,
    fetchHtml: vi.fn(load),
    renderHtml: vi.fn(load),
    whatsapp: notifier('whatsapp'),
    github: {
      ...notifier('github'),
      mentionOwner: true,
      closeIssues: vi.fn<(closes: IssueClose[]) => Promise<void>>(async () => {}),
    },
    commit: vi.fn<(message: string) => void>(),
  };
}

describe('run', () => {
  it('sends one price-drop alert and persists lastAlertedPrice', async () => {
    writeProducts([{}]);
    writePrice('p1', [1000]);
    const deps = setup(async () => page(900));
    let mentioned: boolean | undefined;
    deps.github.send.mockImplementation(async () => {
      mentioned = deps.github.mentionOwner;
    });

    await run(deps);

    expect(deps.whatsapp.send).toHaveBeenCalledTimes(1);
    const alerts = deps.whatsapp.send.mock.calls[0]![0];
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: 'price-drop', oldPrice: 1000, newPrice: 900 });
    expect(deps.github.send).toHaveBeenCalledWith(alerts);
    expect(mentioned).toBe(false);

    const file = readPrice('p1');
    expect(file.lastAlertedPrice).toBe(900);
    expect(file.history.map((point) => point.price)).toEqual([1000, 900]);
    expect(file.title).toBe('Headphones');
    expect(file.imageUrl).toBe('https://shop1.example/img.jpg');
  });

  it('sends nothing and adds no point when the price is unchanged', async () => {
    writeProducts([{}]);
    writePrice('p1', [1000]);
    const deps = setup(async () => page(1000));

    await run(deps);

    expect(deps.whatsapp.send).not.toHaveBeenCalled();
    expect(deps.github.send).not.toHaveBeenCalled();
    const file = readPrice('p1');
    expect(file.history).toHaveLength(1);
    expect(file.lastCheckedAt).not.toBe('2026-10-20T00:00:00Z');
  });

  it('never alerts twice for the same price', async () => {
    writeProducts([{}]);
    writePrice('p1', [1000]);
    // Back at 900 is still 10% under the first price, so only lastAlertedPrice stops this.
    const prices = [900, 950, 900];
    const deps = setup(async () => page(prices.shift()!));

    for (let i = 0; i < 3; i++) await run(deps);

    expect(deps.whatsapp.send).toHaveBeenCalledTimes(1);
    expect(deps.github.send).toHaveBeenCalledTimes(1);
    expect(readPrice('p1').history.map((point) => point.price)).toEqual([1000, 900, 950, 900]);
  });

  it('keeps lastAlertedPrice when every notifier fails, but still writes the file', async () => {
    writeProducts([{}]);
    writePrice('p1', [1000]);
    const deps = setup(async () => page(900));
    deps.whatsapp.send.mockRejectedValue(new Error('down'));
    deps.github.send.mockRejectedValue(new Error('down'));

    await run(deps);

    const file = readPrice('p1');
    expect(file.lastAlertedPrice).toBeUndefined();
    expect(file.history.map((point) => point.price)).toEqual([1000, 900]);
    expect(deps.github.mentionOwner).toBe(true);
    expect(deps.commit).toHaveBeenCalled();
  });

  it('mentions the owner on GitHub when WhatsApp is not configured', async () => {
    writeProducts([{}]);
    writePrice('p1', [1000]);
    const deps = setup(async () => page(900));
    let mentioned: boolean | undefined;
    deps.whatsapp.enabled.mockReturnValue(false);
    deps.github.mentionOwner = false;
    deps.github.send.mockImplementation(async () => {
      mentioned = deps.github.mentionOwner;
    });

    await run(deps);

    expect(deps.whatsapp.send).not.toHaveBeenCalled();
    expect(mentioned).toBe(true);
    expect(readPrice('p1').lastAlertedPrice).toBe(900);
  });

  it('mentions the owner on GitHub when WhatsApp fails', async () => {
    writeProducts([{}]);
    writePrice('p1', [1000]);
    const deps = setup(async () => page(900));
    let mentioned: boolean | undefined;
    deps.whatsapp.send.mockRejectedValue(new Error('down'));
    deps.github.mentionOwner = false;
    deps.github.send.mockImplementation(async () => {
      mentioned = deps.github.mentionOwner;
    });

    await run(deps);

    expect(mentioned).toBe(true);
    expect(readPrice('p1').lastAlertedPrice).toBe(900);
  });

  it('sends one cant-read-price alert on the third failure in a row', async () => {
    writeProducts([{}]);
    const deps = setup(async () => {
      throw new Error('HTTP 403');
    });

    for (let i = 0; i < 4; i++) await run(deps);

    expect(deps.whatsapp.send).toHaveBeenCalledTimes(1);
    expect(deps.whatsapp.send.mock.calls[0]![0][0]).toMatchObject({ kind: 'cant-read-price' });
    const file = readPrice('p1');
    expect(file.consecutiveFailures).toBe(4);
    expect(file.lastError).toBe('HTTP 403');
    expect(file.history).toEqual([]);
  });

  it('clears the failure count, error and cant-read-alerted flag after a success', async () => {
    writeProducts([{}]);
    writePrice('p1', [1000], {
      consecutiveFailures: 2,
      lastError: 'no price found',
      cantReadAlerted: true,
    });
    const deps = setup(async () => page(1000));

    await run(deps);

    const file = readPrice('p1');
    expect(file.consecutiveFailures).toBe(0);
    expect(file.lastError).toBeUndefined();
    expect(file.cantReadAlerted).toBeUndefined();
  });

  it('retries the cant-read-price alert on a later run if delivery failed', async () => {
    writeProducts([{}]);
    const deps = setup(async () => {
      throw new Error('HTTP 403');
    });
    deps.whatsapp.send.mockRejectedValueOnce(new Error('down'));
    deps.github.send.mockRejectedValueOnce(new Error('down'));

    for (let i = 0; i < 4; i++) await run(deps);

    expect(deps.whatsapp.send).toHaveBeenCalledTimes(2);
    expect(readPrice('p1').cantReadAlerted).toBe(true);
  });

  it('records the extraction error as the reason', async () => {
    writeProducts([{}]);
    const deps = setup(async () => '<html></html>');

    await run(deps);

    expect(readPrice('p1')).toMatchObject({ lastError: 'no price found', consecutiveFailures: 1 });
  });

  it('deletes price files of removed products and closes their issue', async () => {
    writeProducts([{}]);
    writePrice('p1', [1000]);
    writePrice('gone', [500], { issueNumber: 7 });
    writePrice('old', [500]);
    const deps = setup(async () => page(1000));

    await run(deps);

    expect(existsSync(join(dataDir, 'prices', 'gone.json'))).toBe(false);
    expect(existsSync(join(dataDir, 'prices', 'old.json'))).toBe(false);
    expect(deps.github.closeIssues).toHaveBeenCalledTimes(1);
    expect(deps.github.closeIssues).toHaveBeenCalledWith([
      expect.objectContaining({ issueNumber: 7, reason: 'deleted' }),
    ]);
  });

  it("keeps a removed product's price file until its issue is closed", async () => {
    writeProducts([]);
    writePrice('gone', [500], { issueNumber: 7 });
    const deps = setup(async () => page(1000));
    deps.github.closeIssues.mockRejectedValueOnce(new Error('down'));

    await run(deps);
    expect(existsSync(join(dataDir, 'prices', 'gone.json'))).toBe(true);

    await run(deps);
    expect(existsSync(join(dataDir, 'prices', 'gone.json'))).toBe(false);
    expect(deps.github.closeIssues).toHaveBeenCalledTimes(2);
  });

  it('does not fetch a bought product and closes its issue', async () => {
    writeProducts([{ bought: true }]);
    writePrice('p1', [1000], { issueNumber: 9 });
    const deps = setup(async () => page(900));

    await run(deps);

    expect(deps.fetchHtml).not.toHaveBeenCalled();
    expect(deps.github.closeIssues).toHaveBeenCalledWith([
      expect.objectContaining({ issueNumber: 9, reason: 'bought' }),
    ]);
    const file = readPrice('p1');
    expect(file.issueNumber).toBeUndefined();
    expect(file.history).toHaveLength(1);
  });

  it('keeps the issue number when closing fails, so it is retried', async () => {
    writeProducts([{ bought: true }]);
    writePrice('p1', [1000], { issueNumber: 9 });
    const deps = setup(async () => page(900));
    deps.github.closeIssues.mockRejectedValue(new Error('down'));

    await run(deps);

    expect(readPrice('p1').issueNumber).toBe(9);
  });

  it('renders the page in a browser when useBrowser is set', async () => {
    writeProducts([{ useBrowser: true }]);
    const deps = setup(async () => page(1000));

    await run(deps);

    expect(deps.renderHtml).toHaveBeenCalledWith('https://shop1.example/item');
    expect(deps.fetchHtml).not.toHaveBeenCalled();
  });

  it('commits with the number of checked and changed products', async () => {
    writeProducts([{}, {}, { bought: true }, {}]);
    writePrice('p1', [1000]);
    writePrice('p2', [500]);
    const prices: Record<string, number> = {
      'https://shop1.example/item': 900,
      'https://shop2.example/item': 500,
      'https://shop4.example/item': 200,
    };
    const deps = setup(async (url) => page(prices[url]!));

    await run(deps);

    expect(deps.commit).toHaveBeenCalledWith('chore(prices): check 3 products (2 changed)');
  });

  it('handles a missing products.json and prices folder', async () => {
    const deps = setup(async () => page(1000));

    await run(deps);

    expect(deps.fetchHtml).not.toHaveBeenCalled();
    expect(deps.commit).toHaveBeenCalledWith('chore(prices): check 0 products (0 changed)');
  });
});
