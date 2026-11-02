import { describe, expect, it } from 'vitest';
import { shouldAlert } from '../src/alerts';
import { PriceFile, Product } from '../src/schemas';

function product(overrides: Partial<Product> = {}): Product {
  return Product.parse({
    id: 'p1',
    url: 'https://shop.example/item',
    shop: 'shop.example',
    addedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  });
}

function priceFile(prices: number[], lastAlertedPrice?: number): PriceFile {
  return PriceFile.parse({
    productId: 'p1',
    history: prices.map((price, i) => ({ at: `2026-10-0${i + 1}T00:00:00Z`, price })),
    lastCheckedAt: '2026-10-26T00:00:00Z',
    lastAlertedPrice,
  });
}

describe('shouldAlert', () => {
  it('never alerts on the first price ever recorded', () => {
    expect(shouldAlert(product({ targetPrice: 2000 }), priceFile([]), 1000)).toBe(false);
  });

  it('does not alert when the price is unchanged', () => {
    expect(shouldAlert(product({ targetPrice: 2000 }), priceFile([1000]), 1000)).toBe(false);
  });

  it('never alerts on a price increase, even below target', () => {
    expect(shouldAlert(product({ targetPrice: 2000 }), priceFile([1000]), 1100)).toBe(false);
  });

  it('alerts on a drop to or below the target price', () => {
    expect(shouldAlert(product({ targetPrice: 990 }), priceFile([1000]), 990)).toBe(true);
    expect(shouldAlert(product({ targetPrice: 990 }), priceFile([1000]), 980)).toBe(true);
  });

  it('alerts on a drop of at least minDropPercent from the first price', () => {
    expect(shouldAlert(product(), priceFile([1000]), 950)).toBe(true);
    expect(shouldAlert(product({ minDropPercent: 10 }), priceFile([1000, 980]), 900)).toBe(true);
  });

  it('does not alert on a drop smaller than minDropPercent that stays above target', () => {
    expect(shouldAlert(product({ targetPrice: 900 }), priceFile([1000]), 960)).toBe(false);
  });

  it('alerts on any drop when minDropPercent is 0', () => {
    expect(shouldAlert(product({ minDropPercent: 0 }), priceFile([1000]), 999.99)).toBe(true);
  });

  it('measures the drop from lastAlertedPrice once an alert has been sent', () => {
    const p = product();
    // Alerted at 950 (5% off 1000); 940 is only ~1% below that.
    expect(shouldAlert(p, priceFile([1000, 950], 950), 940)).toBe(false);
    expect(shouldAlert(p, priceFile([1000, 950, 940], 950), 910)).toBe(false);
    // 902.5 is 5% below 950.
    expect(shouldAlert(p, priceFile([1000, 950, 940, 910], 950), 902.5)).toBe(true);
  });

  it('never alerts twice for the same price', () => {
    // Alerted at 799, rose to 801, drops back to 799: still below target, but already alerted.
    const p = product({ targetPrice: 800 });
    expect(shouldAlert(p, priceFile([1000, 799, 801], 799), 799)).toBe(false);
    expect(
      shouldAlert(product({ minDropPercent: 0 }), priceFile([1000, 950, 1000], 950), 950),
    ).toBe(false);
  });

  it('alerts again on a drop below the last alerted price that meets the target', () => {
    const p = product({ targetPrice: 800 });
    expect(shouldAlert(p, priceFile([1000, 799, 801], 799), 798)).toBe(true);
  });
});
