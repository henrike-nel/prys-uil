import { TIMEOUT_MS } from '../fetch';
import { displayName, formatChange, formatPrice } from '../format';
import type { Alert, Notifier } from './types';

// One message per alert up to this many; a single summary above it.
const MAX_MESSAGES = 3;

export class CallMeBotNotifier implements Notifier {
  name = 'whatsapp';

  enabled(): boolean {
    return Boolean(process.env.CALLMEBOT_PHONE && process.env.CALLMEBOT_APIKEY);
  }

  async send(alerts: Alert[]): Promise<void> {
    const messages = alerts.length <= MAX_MESSAGES ? alerts.map(message) : [summary(alerts)];
    for (const text of messages) await sendMessage(text);
  }
}

function message(alert: Alert): string {
  const { product, priceFile } = alert;
  const name = displayName(product, priceFile);
  if (alert.kind === 'cant-read-price') {
    return `PrysUil: can't read the price for ${name} (${priceFile.lastError}). Set a CSS selector or enable "use browser".\n${product.url}`;
  }
  const { oldPrice, newPrice } = alert;
  const target = product.targetPrice ? ` Target ${formatPrice(product.targetPrice)}.` : '';
  return `PrysUil: ${name} dropped to ${formatPrice(newPrice)} (was ${formatPrice(oldPrice)}, ${formatChange(oldPrice, newPrice)}).${target}\n${product.url}`;
}

function summary(alerts: Alert[]): string {
  const lines = alerts.map((alert) => {
    const name = displayName(alert.product, alert.priceFile);
    return alert.kind === 'cant-read-price'
      ? `${name}: can't read price (${alert.priceFile.lastError})`
      : `${name}: ${formatPrice(alert.newPrice)} (was ${formatPrice(alert.oldPrice)})`;
  });
  return [`PrysUil: ${alerts.length} alerts`, ...lines].join('\n');
}

// Errors never include the URL: it holds the phone number and API key.
async function sendMessage(text: string): Promise<void> {
  const url = new URL('https://api.callmebot.com/whatsapp.php');
  url.search = new URLSearchParams({
    phone: process.env.CALLMEBOT_PHONE ?? '',
    apikey: process.env.CALLMEBOT_APIKEY ?? '',
    text,
  }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(
    (error: Error) => {
      throw new Error(error.name === 'TimeoutError' ? 'timeout' : 'request failed');
    },
  );
  // CallMeBot answers 200 with an error message in the body for a bad key.
  const body = await response.text();
  if (!response.ok || /error|invalid/i.test(body)) {
    throw new Error(`CallMeBot rejected the message (HTTP ${response.status})`);
  }
}
