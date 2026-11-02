import { describe, expect, it } from 'vitest';
import { Product } from '@prysuil/shared';
import { emptyForm, formFrom, toProduct, urlError, webUrl } from '../src/lib/product';

const base = { id: 'p1', addedAt: '2026-10-01T00:00:00.000Z' };
const existing = Product.parse({
  id: 'p1',
  url: 'https://www.takealot.com/item/PLID1',
  shop: 'takealot.com',
  addedAt: base.addedAt,
});

describe('webUrl', () => {
  it('only allows http and https links', () => {
    expect(webUrl('https://shop.example/a')).toBe('https://shop.example/a');
    expect(webUrl('http://shop.example/a')).toBe('http://shop.example/a');
    expect(webUrl('javascript:alert(1)')).toBeUndefined();
    expect(webUrl('not a url')).toBeUndefined();
  });
});

describe('urlError', () => {
  it('rejects links that do not parse or are not http(s)', () => {
    expect(urlError('', [])).toMatch(/valid link/);
    expect(urlError('takealot.com/item', [])).toMatch(/valid link/);
    expect(urlError('javascript:alert(1)', [])).toMatch(/valid link/);
  });

  it('rejects a duplicate after normalising', () => {
    const url = 'https://www.takealot.com/item/PLID1/?utm_source=x#reviews';
    expect(urlError(url, [existing])).toBe('This product is already on the list.');
  });

  it('accepts a new link, or the product being edited', () => {
    expect(urlError('https://www.takealot.com/item/PLID2', [existing])).toBeUndefined();
    expect(urlError(existing.url, [existing], 'p1')).toBeUndefined();
  });
});

describe('toProduct', () => {
  it('builds a new product with only the fields that were filled in', () => {
    const form = { ...emptyForm(), url: ' https://www.takealot.com/item/PLID1/?utm_source=x ' };
    expect(toProduct(form, base)).toEqual({
      ...base,
      url: 'https://www.takealot.com/item/PLID1',
      shop: 'takealot.com',
      minDropPercent: 5,
      useBrowser: false,
      bought: false,
    });
  });

  it('keeps every edited field', () => {
    const form = {
      url: 'https://shop.example/a',
      targetPrice: 900,
      minDropPercent: 10,
      name: 'Headphones',
      selector: '.price',
      useBrowser: true,
      bought: true,
    };
    expect(toProduct(form, base)).toEqual({ ...base, ...form, shop: 'shop.example' });
  });

  it('round-trips through formFrom', () => {
    expect(toProduct(formFrom(existing), base)).toEqual(existing);
  });
});
