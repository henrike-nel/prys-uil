import { describe, expect, it } from 'vitest';
import { changeSinceAdded, currentPrice, lowestPrice } from '../src/derived';
import { PriceFile } from '../src/schemas';

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
