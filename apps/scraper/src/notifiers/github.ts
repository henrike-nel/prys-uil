import { Octokit } from '@octokit/rest';
import { lowestPrice } from '@prysuil/shared';
import { displayName, formatChange, formatPrice } from '../format';
import type { Alert, Notifier, SendOptions } from './types';

export type IssueClose = { issueNumber: number; reason: 'bought' | 'deleted' };

const closeComments = {
  bought: 'Marked as bought, closing.',
  deleted: 'Product removed from the list, closing.',
};

export class GitHubIssuesNotifier implements Notifier {
  name = 'github';
  private repo: { owner: string; repo: string };

  constructor(
    private octokit: Octokit = new Octokit({ auth: process.env.GITHUB_TOKEN }),
    repository = process.env.GITHUB_REPOSITORY ?? '',
  ) {
    const [owner = '', repo = ''] = repository.split('/');
    this.repo = { owner, repo };
  }

  enabled(): boolean {
    return true;
  }

  async send(alerts: Alert[], options?: SendOptions): Promise<void> {
    for (const alert of alerts) {
      const { issues } = this.octokit.rest;
      const drop = alert.kind === 'price-drop';
      const label = drop ? 'price-drop' : 'scrape-error';
      const staleLabel = drop ? 'scrape-error' : 'price-drop';
      const issueNumber = alert.priceFile.issueNumber;
      const mention = options?.mentionOwner ? [`@${this.repo.owner}`] : [];

      if (issueNumber === undefined) {
        const image = alert.priceFile.imageUrl ? [`![](${alert.priceFile.imageUrl})`] : [];
        const { data } = await issues.create({
          ...this.repo,
          title: `${drop ? 'Price drop' : "Can't read price"}: ${displayName(alert.product, alert.priceFile)}`,
          body: [...mention, ...image, facts(alert)].join('\n\n'),
          labels: [label],
        });
        alert.priceFile.issueNumber = data.number;
      } else {
        const body = [...mention, facts(alert)].join('\n\n');
        await issues.createComment({ ...this.repo, issue_number: issueNumber, body });
        await issues.addLabels({ ...this.repo, issue_number: issueNumber, labels: [label] });
        // The issue may have switched kind (e.g. scrape-error -> price-drop); drop
        // the other kind's label so it doesn't accumulate both forever.
        await issues
          .removeLabel({ ...this.repo, issue_number: issueNumber, name: staleLabel })
          .catch((error: { status?: number }) => {
            if (error.status !== 404) throw error;
          });
      }
    }
  }

  async closeIssue({ issueNumber, reason }: IssueClose): Promise<void> {
    const { issues } = this.octokit.rest;
    const body = closeComments[reason];
    await issues.createComment({ ...this.repo, issue_number: issueNumber, body });
    await issues.update({ ...this.repo, issue_number: issueNumber, state: 'closed' });
  }
}

function facts(alert: Alert): string {
  const { product, priceFile } = alert;
  const shop = `[${product.shop}](${product.url})`;
  if (alert.kind === 'cant-read-price') {
    return `Can't read the price (${priceFile.lastError}). Set a CSS selector or enable "use browser".\n\nShop: ${shop}`;
  }
  const { oldPrice, newPrice } = alert;
  const lowest = lowestPrice(priceFile);
  return [
    `- Current price: ${formatPrice(newPrice)}`,
    `- Previous price: ${formatPrice(oldPrice)}`,
    `- Change: ${formatChange(oldPrice, newPrice)}`,
    `- Target: ${product.targetPrice ? formatPrice(product.targetPrice) : 'none'}`,
    `- Lowest seen: ${lowest === undefined ? 'none' : formatPrice(lowest)}`,
    `- Tracking since: ${product.addedAt.slice(0, 10)}`,
    `- Shop: ${shop}`,
  ].join('\n');
}
