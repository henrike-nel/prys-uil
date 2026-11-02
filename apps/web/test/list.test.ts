import { describe, expect, it } from 'vitest';
import { PriceFile, Product } from '@prysuil/shared';
import { badge, forWhomNames, visibleProducts } from '../src/lib/list';

function product(extra: Partial<Product> = {}): Product {
  return Product.parse({
    id: 'p1',
    url: 'https://shop.example/item',
    shop: 'shop.example',
    addedAt: '2026-10-01T00:00:00Z',
    ...extra,
  });
}

function priceFile(prices: number[], extra: Partial<PriceFile> = {}): PriceFile {
  return PriceFile.parse({
    productId: 'p1',
    history: prices.map((price, i) => ({ at: `2026-10-0${i + 1}T00:00:00Z`, price })),
    lastCheckedAt: '2026-10-05T00:00:00Z',
    ...extra,
  });
}

describe('badge', () => {
  it('shows Checking… without a price file or price history', () => {
    expect(badge(product())).toBe('checking');
    expect(badge(product(), priceFile([]))).toBe('checking');
  });

  it('shows Bought', () => {
    expect(badge(product({ bought: true }), priceFile([1000]))).toBe('bought');
  });

  it("shows Can't read price when lastError is set", () => {
    expect(badge(product(), priceFile([1000], { lastError: 'HTTP 403' }))).toBe('cant-read');
  });

  it('shows Below target at or under the target price', () => {
    expect(badge(product({ targetPrice: 900 }), priceFile([1000, 900]))).toBe('below-target');
    expect(badge(product({ targetPrice: 900 }), priceFile([850]))).toBe('below-target');
  });

  it('shows Price dropped when the price is lower than when added', () => {
    expect(badge(product(), priceFile([1000, 950]))).toBe('dropped');
  });

  it('shows nothing when the price is unchanged or higher', () => {
    expect(badge(product(), priceFile([1000]))).toBeUndefined();
    expect(badge(product({ targetPrice: 500 }), priceFile([1000, 1100]))).toBeUndefined();
  });

  it('applies the precedence when several match', () => {
    const dropped = priceFile([1000, 800]);
    const failing = priceFile([1000, 800], { lastError: 'no price found' });
    expect(badge(product({ bought: true, targetPrice: 900 }), failing)).toBe('bought');
    expect(badge(product({ bought: true }), priceFile([]))).toBe('bought');
    expect(badge(product({ targetPrice: 900 }), failing)).toBe('cant-read');
    expect(badge(product(), priceFile([], { lastError: 'HTTP 403' }))).toBe('cant-read');
    expect(badge(product({ targetPrice: 900 }), dropped)).toBe('below-target');
  });
});

describe('forWhomNames', () => {
  it('lists each name once, sorted', () => {
    const products = [
      product({ forWhom: 'Mom' }),
      product({ forWhom: 'Dad' }),
      product(),
      product({ forWhom: 'Mom' }),
    ];
    expect(forWhomNames(products)).toEqual(['Dad', 'Mom']);
  });
});

describe('visibleProducts', () => {
  const products = [
    product({ id: 'a', name: 'Alpha', forWhom: 'Dad' }),
    product({ id: 'b', name: 'Bravo', bought: true }),
    product({ id: 'c', name: 'Charlie', forWhom: 'Mom' }),
    product({ id: 'd', name: 'Delta', forWhom: 'Dad' }),
    product({ id: 'e', name: 'Echo' }),
  ];
  const priceFiles = {
    a: priceFile([1000, 900]), // -10%
    b: priceFile([1000, 500]), // -50%
    c: priceFile([1000, 700]), // -30%
    d: priceFile([1000, 1100]), // +10%
  };
  const ids = (list: Product[]) => list.map((p) => p.id);

  it('sorts by biggest drop, unpriced last, and hides bought', () => {
    expect(ids(visibleProducts(products, priceFiles, { forWhom: '', hideBought: true }))).toEqual([
      'c',
      'a',
      'd',
      'e',
    ]);
  });

  it('shows bought products when asked', () => {
    expect(ids(visibleProducts(products, priceFiles, { forWhom: '', hideBought: false }))).toEqual([
      'b',
      'c',
      'a',
      'd',
      'e',
    ]);
  });

  it('filters by who it is for', () => {
    expect(
      ids(visibleProducts(products, priceFiles, { forWhom: 'Dad', hideBought: true })),
    ).toEqual(['a', 'd']);
  });

  it('sorts equal changes and unpriced products by display name', () => {
    const list = [
      product({ id: 'z', shop: 'zulu.example' }),
      product({ id: 'y', name: 'Yankee' }),
      product({ id: 'x', shop: 'xray.example' }),
      product({ id: 'w', name: 'Whiskey' }),
    ];
    const files = { y: priceFile([100, 90]), w: priceFile([100, 90]) };
    expect(ids(visibleProducts(list, files, { forWhom: '', hideBought: true }))).toEqual([
      'w',
      'y',
      'x',
      'z',
    ]);
  });

  it('does not reorder the original list', () => {
    const before = ids(products);
    visibleProducts(products, priceFiles, { forWhom: '', hideBought: false });
    expect(ids(products)).toEqual(before);
  });
});
