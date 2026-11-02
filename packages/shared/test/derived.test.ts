import { describe, expect, it } from 'vitest';
import {
  changeSinceAdded,
  currentPrice,
  displayName,
  formatPercent,
  isBelowTarget,
  lowestPrice,
  percentChange,
} from '../src/derived';
import { PriceFile, Product } from '../src/schemas';

function priceFile(prices: number[]): PriceFile {
  return PriceFile.parse({
    productId: 'p1',
    history: prices.map((price, i) => ({ at: `2026-10-0${i + 1}T00:00:00Z`, price })),
    lastCheckedAt: '2026-10-26T00:00:00Z',
  });
}

describe('derived values', () => {
  it('are undefined when there is no history', () => {
    const file = priceFile([]);
    expect(currentPrice(file)).toBeUndefined();
    expect(lowestPrice(file)).toBeUndefined();
    expect(changeSinceAdded(file)).toBeUndefined();
  });

  it('handle a single price', () => {
    const file = priceFile([1299]);
    expect(currentPrice(file)).toBe(1299);
    expect(lowestPrice(file)).toBe(1299);
    expect(changeSinceAdded(file)).toBe(0);
  });

  it('handle a price history', () => {
    const file = priceFile([1000, 700, 900, 800]);
    expect(currentPrice(file)).toBe(800);
    expect(lowestPrice(file)).toBe(700);
    expect(changeSinceAdded(file)).toBe(-20);
  });

  it('report a price rise as a positive change', () => {
    expect(changeSinceAdded(priceFile([1000, 1250]))).toBe(25);
  });
});

describe('percentChange', () => {
  it('computes the signed percentage between two prices', () => {
    expect(percentChange(1000, 800)).toBe(-20);
    expect(percentChange(1000, 1250)).toBe(25);
  });
});

describe('formatPercent', () => {
  it('signs and rounds the percentage', () => {
    expect(formatPercent(-20.6)).toBe('-21%');
    expect(formatPercent(25)).toBe('+25%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(-0.2)).toBe('0%');
    expect(formatPercent(undefined)).toBe('–');
  });
});

describe('displayName', () => {
  const product = Product.parse({
    id: 'p1',
    url: 'https://www.takealot.com/item',
    shop: 'takealot.com',
    addedAt: '2026-10-01T00:00:00Z',
  });
  const file = priceFile([1000]);

  it('prefers the name override', () => {
    expect(displayName({ ...product, name: 'My name' }, file)).toBe('My name');
  });

  it('falls back to the scraped title, then the shop', () => {
    expect(displayName(product, { ...file, title: 'Scraped title' })).toBe('Scraped title');
    expect(displayName(product, file)).toBe('takealot.com');
    expect(displayName(product)).toBe('takealot.com');
  });
});

describe('isBelowTarget', () => {
  const product = Product.parse({
    id: 'p1',
    url: 'https://shop.example/item',
    shop: 'shop.example',
    addedAt: '2026-10-01T00:00:00Z',
  });

  it('is false without a target price', () => {
    expect(isBelowTarget(product, 1)).toBe(false);
  });

  it('is true at or below the target price, false above it', () => {
    const withTarget = { ...product, targetPrice: 900 };
    expect(isBelowTarget(withTarget, 900)).toBe(true);
    expect(isBelowTarget(withTarget, 899)).toBe(true);
    expect(isBelowTarget(withTarget, 901)).toBe(false);
  });
});
