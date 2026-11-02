import {
  extractImage,
  extractPrice,
  extractTitle,
  shouldAlert,
  type ExtractResult,
  type PriceFile,
  type Product,
} from '@prysuil/shared';
import { renderHtml as defaultRenderHtml } from './browser';
import { createThrottle, fetchHtml as defaultFetchHtml } from './fetch';
import { displayName } from './format';
import { commitPrices } from './git';
import { CallMeBotNotifier } from './notifiers/callmebot';
import { GitHubIssuesNotifier, type IssueClose } from './notifiers/github';
import type { Alert, Notifier } from './notifiers/types';
import { DATA_DIR, deletePriceFile, readPriceFiles, readProducts, writePriceFile } from './store';

type GitHub = Notifier & Pick<GitHubIssuesNotifier, 'mentionOwner' | 'closeIssues'>;

export interface Deps {
  dataDir: string;
  fetchHtml: (url: string) => Promise<string>;
  renderHtml: (url: string) => Promise<string>;
  whatsapp: Notifier;
  github: GitHub;
  commit: (message: string) => void;
}

interface Checked {
  product: Product;
  previous?: PriceFile;
  file: PriceFile;
  newPrice?: number;
  changed: boolean;
}

export async function run({
  dataDir = DATA_DIR,
  fetchHtml = defaultFetchHtml,
  renderHtml = defaultRenderHtml,
  whatsapp = new CallMeBotNotifier(),
  github = new GitHubIssuesNotifier(),
  commit = (message) => commitPrices(dataDir, message),
}: Partial<Deps> = {}): Promise<void> {
  const { products } = await readProducts(dataDir);
  const files = await readPriceFiles(dataDir);

  // The price file is the only record of a product's issue, so a removed product's
  // file is kept until its issue is closed.
  const closes: (IssueClose & { file: PriceFile })[] = [];
  const ids = new Set(products.map((product) => product.id));
  for (const [id, file] of files) {
    if (ids.has(id)) continue;
    if (file.issueNumber === undefined) await deletePriceFile(dataDir, id);
    else closes.push({ issueNumber: file.issueNumber, reason: 'deleted', file });
  }
  for (const product of products) {
    const file = files.get(product.id);
    if (product.bought && file?.issueNumber !== undefined) {
      closes.push({ issueNumber: file.issueNumber, reason: 'bought', file });
    }
  }

  const active = products.filter((product) => !product.bought);
  const throttle = createThrottle();
  const results = await Promise.all(
    active.map((product) => {
      const load = product.useBrowser ? renderHtml : fetchHtml;
      return check(product, files.get(product.id), () =>
        throttle(product.url, () => load(product.url)),
      );
    }),
  );

  const alerts: Alert[] = [];
  for (const { product, previous, file, newPrice } of results) {
    if (newPrice !== undefined && previous && shouldAlert(product, previous, newPrice)) {
      const oldPrice = previous.history.at(-1)?.price;
      alerts.push({ kind: 'price-drop', product, priceFile: file, oldPrice, newPrice });
    }
    // Exactly 3, so a longer streak doesn't alert again; a success resets the count.
    if (file.consecutiveFailures === 3)
      alerts.push({ kind: 'cant-read-price', product, priceFile: file });
  }

  if (alerts.length > 0) {
    console.log(`Sending ${alerts.length} alert(s)`);
    const sentWhatsApp = await deliver(whatsapp, alerts);
    github.mentionOwner = !sentWhatsApp;
    const sentGitHub = await deliver(github, alerts);
    if (sentWhatsApp || sentGitHub) {
      for (const alert of alerts) {
        if (alert.kind === 'price-drop') alert.priceFile.lastAlertedPrice = alert.newPrice;
      }
    }
  }

  for (const close of closes) {
    try {
      await github.closeIssues([close]);
      if (close.reason === 'deleted') {
        await deletePriceFile(dataDir, close.file.productId);
      } else {
        delete close.file.issueNumber;
        await writePriceFile(dataDir, close.file);
      }
    } catch (error) {
      console.log(`Could not close issue #${close.issueNumber}: ${reason(error)}`);
    }
  }

  for (const { file } of results) await writePriceFile(dataDir, file);

  const changed = results.filter((result) => result.changed).length;
  const message = `chore(prices): check ${active.length} products (${changed} changed)`;
  console.log(message);
  commit(message);
}

async function check(
  product: Product,
  previous: PriceFile | undefined,
  load: () => Promise<string>,
): Promise<Checked> {
  let html = '';
  let result: ExtractResult;
  try {
    html = await load();
    result = extractPrice(html, product.selector);
  } catch (error) {
    result = { error: reason(error) };
  }

  const at = new Date().toISOString();
  const file: PriceFile = structuredClone(previous) ?? {
    productId: product.id,
    history: [],
    lastCheckedAt: at,
    consecutiveFailures: 0,
  };
  file.lastCheckedAt = at;

  const name = displayName(product, file);
  if ('error' in result) {
    file.lastError = result.error;
    file.consecutiveFailures += 1;
    console.log(`${name}: ${result.error}`);
    return { product, previous, file, changed: false };
  }

  const last = file.history.at(-1);
  const changed = last?.price !== result.price || last.inStock !== result.inStock;
  if (changed) file.history.push({ at, ...result });
  file.title = extractTitle(html) ?? file.title;
  file.imageUrl = resolveUrl(extractImage(html), product.url) ?? file.imageUrl;
  delete file.lastError;
  file.consecutiveFailures = 0;
  console.log(`${name}: ${result.price}${changed ? ' (changed)' : ''}`);
  return { product, previous, file, newPrice: result.price, changed };
}

async function deliver(notifier: Notifier, alerts: Alert[]): Promise<boolean> {
  if (!notifier.enabled()) return false;
  try {
    await notifier.send(alerts);
    return true;
  } catch (error) {
    console.log(`${notifier.name} failed: ${reason(error)}`);
    return false;
  }
}

function resolveUrl(url: string | undefined, base: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, base).toString();
  } catch {
    return undefined;
  }
}

// A short reason for the price file and the logs, e.g. "HTTP 403" or "timeout".
function reason(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (error.name === 'TimeoutError') return 'timeout';
  return error.message.split('\n')[0] ?? error.message;
}
