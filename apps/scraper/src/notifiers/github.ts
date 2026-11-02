import { Octokit } from '@octokit/rest';
import { lowestPrice } from '@prysuil/shared';
import { displayName, formatChange, formatPrice } from '../format';
import type { Alert, Notifier } from './types';

export type IssueClose = { issueNumber: number; reason: 'bought' | 'deleted' };

const closeComments = {
  bought: 'Marked as bought, closing.',
  deleted: 'Product removed from the list, closing.',
};

export class GitHubIssuesNotifier implements Notifier {
  name = 'github';
  // Set by the run: false when WhatsApp already delivered, so the owner isn't pinged twice.
  mentionOwner = true;
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

  async send(alerts: Alert[]): Promise<void> {
    for (const alert of alerts) {
      const { issues } = this.octokit.rest;
      const drop = alert.kind === 'price-drop';
      const label = drop ? 'price-drop' : 'scrape-error';
      const issueNumber = alert.priceFile.issueNumber;
      const mention = this.mentionOwner ? [`@${this.repo.owner}`] : [];

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
      }
    }
  }

  async closeIssues(closes: IssueClose[]): Promise<void> {
    const { issues } = this.octokit.rest;
    for (const { issueNumber, reason } of closes) {
      const body = closeComments[reason];
      await issues.createComment({ ...this.repo, issue_number: issueNumber, body });
      await issues.update({ ...this.repo, issue_number: issueNumber, state: 'closed' });
    }
  }
}

function facts({ kind, product, priceFile, oldPrice, newPrice }: Alert): string {
  const shop = `[${product.shop}](${product.url})`;
  if (kind === 'cant-read-price') {
    return `Can't read the price (${priceFile.lastError}). Set a CSS selector or enable "use browser".\n\nShop: ${shop}`;
  }
  const lowest = lowestPrice(priceFile);
  return [
    `- Current price: ${formatPrice(newPrice!)}`,
    `- Previous price: ${formatPrice(oldPrice!)}`,
    `- Change: ${formatChange(oldPrice!, newPrice!)}`,
    `- Target: ${product.targetPrice ? formatPrice(product.targetPrice) : 'none'}`,
    `- Lowest seen: ${lowest === undefined ? 'none' : formatPrice(lowest)}`,
    `- Tracking since: ${product.addedAt.slice(0, 10)}`,
    `- Shop: ${shop}`,
  ].join('\n');
}
