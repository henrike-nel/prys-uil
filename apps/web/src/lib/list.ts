import {
  changeSinceAdded,
  currentPrice,
  isBelowTarget,
  type PriceFile,
  type Product,
} from '@prysuil/shared';
import { displayName } from './format';

export type Badge = 'bought' | 'cant-read' | 'below-target' | 'dropped' | 'checking';

export const badgeLabels: Record<Badge, string> = {
  bought: 'Bought',
  'cant-read': "Can't read price",
  'below-target': 'Below target',
  dropped: 'Price dropped',
  checking: 'Checking…',
};

export function badge(product: Product, priceFile?: PriceFile): Badge | undefined {
  if (product.bought) return 'bought';
  if (priceFile?.lastError) return 'cant-read';
  const current = priceFile && currentPrice(priceFile);
  if (!priceFile || current === undefined) return 'checking';
  if (isBelowTarget(product, current)) return 'below-target';
  if ((changeSinceAdded(priceFile) ?? 0) < 0) return 'dropped';
  return undefined;
}

export type Filters = { hideBought: boolean };

// Biggest drop first, products without a price last, then by name.
export function visibleProducts(
  products: Product[],
  priceFiles: Record<string, PriceFile>,
  filters: Filters,
): Product[] {
  const change = (p: Product) => {
    const file = priceFiles[p.id];
    return (file && changeSinceAdded(file)) ?? Infinity;
  };
  const name = (p: Product) => displayName(p, priceFiles[p.id]);
  return products
    .filter((p) => !(filters.hideBought && p.bought))
    .sort((a, b) => {
      const byChange = change(a) - change(b);
      // Infinity - Infinity is NaN, so two unpriced products fall through to the name
      return byChange || name(a).localeCompare(name(b));
    });
}
