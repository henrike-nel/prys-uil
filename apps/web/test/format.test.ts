import { describe, expect, it } from 'vitest';
import { PriceFile, Product } from '@prysuil/shared';
import { displayName, formatChange, formatPrice } from '../src/lib/format';

const product = Product.parse({
  id: 'p1',
  url: 'https://www.takealot.com/item',
  shop: 'takealot.com',
  addedAt: '2026-10-01T00:00:00Z',
});
const priceFile = PriceFile.parse({
  productId: 'p1',
  title: 'Scraped title',
  history: [],
  lastCheckedAt: '2026-10-01T00:00:00Z',
});

describe('displayName', () => {
  it('prefers the name override', () => {
    expect(displayName({ ...product, name: 'My name' }, priceFile)).toBe('My name');
  });

  it('falls back to the scraped title', () => {
    expect(displayName(product, priceFile)).toBe('Scraped title');
  });

  it('falls back to the shop', () => {
    expect(displayName(product)).toBe('takealot.com');
    expect(displayName(product, { ...priceFile, title: undefined })).toBe('takealot.com');
  });
});

describe('formatPrice', () => {
  it('formats ZAR the en-ZA way', () => {
    expect(formatPrice(1299)).toBe('R 1 299,00');
    expect(formatPrice(5499.5)).toBe('R 5 499,50');
  });

  it('shows a dash when there is no price', () => {
    expect(formatPrice(undefined)).toBe('–');
  });
});

describe('formatChange', () => {
  it('signs and rounds the percentage', () => {
    expect(formatChange(-20.6)).toBe('-21%');
    expect(formatChange(25)).toBe('+25%');
    expect(formatChange(0)).toBe('0%');
    expect(formatChange(-0.2)).toBe('0%');
    expect(formatChange(undefined)).toBe('–');
  });
});
