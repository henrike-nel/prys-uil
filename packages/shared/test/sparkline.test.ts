import { describe, expect, it } from 'vitest';
import type { PricePoint } from '../src/schemas';
import { sparklinePath } from '../src/sparkline';

function history(prices: number[]): PricePoint[] {
  return prices.map((price, i) => ({ at: `2026-10-0${i + 1}T00:00:00Z`, price }));
}

describe('sparklinePath', () => {
  it('is undefined with fewer than two points', () => {
    expect(sparklinePath([])).toBeUndefined();
    expect(sparklinePath(history([1000]))).toBeUndefined();
  });

  it('draws two points from the top-left to the bottom-right on a drop', () => {
    expect(sparklinePath(history([1000, 800]))).toBe('M 1 1 L 99 23');
  });

  it('draws a flat line at mid-height when all prices are equal', () => {
    expect(sparklinePath(history([500, 500, 500]))).toBe('M 1 12 L 50 12 L 99 12');
  });

  it('spaces points evenly and scales min and max to the box edges', () => {
    expect(sparklinePath(history([900, 1000, 800, 850, 1000]), 100, 24)).toBe(
      'M 1 12 L 25.5 1 L 50 23 L 74.5 17.5 L 99 1',
    );
  });

  it('fits a custom box size', () => {
    expect(sparklinePath(history([200, 100]), 50, 10)).toBe('M 1 1 L 49 9');
  });
});
