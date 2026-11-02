import type { PriceFile, Product } from '@prysuil/shared';

const zar = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });

export function displayName(product: Product, priceFile?: PriceFile): string {
  return product.name ?? priceFile?.title ?? product.shop;
}

export function formatPrice(price: number | undefined): string {
  return price === undefined ? '–' : zar.format(price);
}

export function formatChange(change: number | undefined): string {
  if (change === undefined) return '–';
  const rounded = Math.round(change);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}
