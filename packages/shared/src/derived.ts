import type { PriceFile, Product } from './schemas';

export function currentPrice(priceFile: PriceFile): number | undefined {
  return priceFile.history.at(-1)?.price;
}

export function lowestPrice(priceFile: PriceFile): number | undefined {
  if (priceFile.history.length === 0) return undefined;
  return Math.min(...priceFile.history.map((point) => point.price));
}

export function percentChange(oldPrice: number, newPrice: number): number {
  return ((newPrice - oldPrice) / oldPrice) * 100;
}

// Percentage change from the first recorded price, e.g. 1000 -> 800 is -20.
export function changeSinceAdded(priceFile: PriceFile): number | undefined {
  const first = priceFile.history[0];
  const latest = priceFile.history.at(-1);
  if (!first || !latest) return undefined;
  return percentChange(first.price, latest.price);
}

export function formatPercent(change: number | undefined): string {
  if (change === undefined) return '–';
  const rounded = Math.round(change);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

export function displayName(product: Product, priceFile?: PriceFile): string {
  return product.name ?? priceFile?.title ?? product.shop;
}

export function isBelowTarget(product: Product, price: number): boolean {
  return product.targetPrice !== undefined && price <= product.targetPrice;
}
