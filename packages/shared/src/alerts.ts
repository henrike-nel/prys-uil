import type { PriceFile, Product } from './schemas';

export function shouldAlert(product: Product, priceFile: PriceFile, newPrice: number): boolean {
  const first = priceFile.history[0];
  const previous = priceFile.history.at(-1);
  if (!first || !previous || newPrice >= previous.price) return false;
  if (newPrice === priceFile.lastAlertedPrice) return false;

  const reference = priceFile.lastAlertedPrice ?? first.price;
  const belowTarget = product.targetPrice !== undefined && newPrice <= product.targetPrice;
  const dropPercent = ((reference - newPrice) / reference) * 100;
  return belowTarget || dropPercent >= product.minDropPercent;
}
