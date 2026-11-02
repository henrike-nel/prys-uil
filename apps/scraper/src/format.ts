import type { PriceFile, Product } from '@prysuil/shared';

const number = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 });

// "R5 499", as in the spec. Intl puts non-breaking spaces in; use plain ones.
export function formatPrice(price: number): string {
  return `R${number.format(price).replace(/\s/g, ' ')}`;
}

export function formatChange(oldPrice: number, newPrice: number): string {
  const percent = Math.round(((newPrice - oldPrice) / oldPrice) * 100);
  return `${percent > 0 ? '+' : ''}${percent}%`;
}

export function displayName(product: Product, priceFile: PriceFile): string {
  return product.name ?? priceFile.title ?? product.shop;
}
