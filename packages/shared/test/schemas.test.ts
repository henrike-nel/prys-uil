import { describe, expect, expectTypeOf, it } from 'vitest';
import { PriceFile, PricePoint, Product, ProductsFile } from '../src/schemas';

const minimalProduct = {
  id: 'abc123',
  url: 'https://shop.example/item',
  shop: 'shop.example',
  addedAt: '2026-10-26T08:00:00Z',
};

const minimalPriceFile = {
  productId: 'abc123',
  history: [],
  lastCheckedAt: '2026-10-26T08:00:00Z',
};

describe('Product', () => {
  it('applies defaults', () => {
    const product = Product.parse(minimalProduct);
    expect(product.minDropPercent).toBe(5);
    expect(product.useBrowser).toBe(false);
    expect(product.bought).toBe(false);
  });

  it('keeps optional fields', () => {
    const product = Product.parse({
      ...minimalProduct,
      name: 'Headphones',
      forWhom: 'Dad',
      targetPrice: 999.5,
      minDropPercent: 0,
      selector: '.price',
      useBrowser: true,
      bought: true,
    });
    expect(product).toMatchObject({ targetPrice: 999.5, minDropPercent: 0, useBrowser: true });
  });

  it.each([
    ['bad url', { url: 'not a url' }],
    ['empty name', { name: '' }],
    ['zero target price', { targetPrice: 0 }],
    ['negative target price', { targetPrice: -10 }],
    ['minDropPercent over 100', { minDropPercent: 101 }],
    ['minDropPercent below 0', { minDropPercent: -1 }],
    ['non-datetime addedAt', { addedAt: '26 Oct 2026' }],
  ])('rejects %s', (_, override) => {
    expect(Product.safeParse({ ...minimalProduct, ...override }).success).toBe(false);
  });

  it('rejects a missing required field', () => {
    expect(Product.safeParse({ ...minimalProduct, shop: undefined }).success).toBe(false);
  });
});

describe('ProductsFile', () => {
  it('parses a valid file', () => {
    const file = ProductsFile.parse({ version: 1, currency: 'ZAR', products: [minimalProduct] });
    expect(file.products[0]?.minDropPercent).toBe(5);
  });

  it('rejects the wrong version', () => {
    expect(ProductsFile.safeParse({ version: 2, currency: 'ZAR', products: [] }).success).toBe(
      false,
    );
  });

  it('rejects a currency other than ZAR', () => {
    expect(ProductsFile.safeParse({ version: 1, currency: 'USD', products: [] }).success).toBe(
      false,
    );
  });
});

describe('PricePoint', () => {
  it('parses a valid point', () => {
    expect(PricePoint.parse({ at: '2026-10-26T08:00:00Z', price: 1299, inStock: true })).toEqual({
      at: '2026-10-26T08:00:00Z',
      price: 1299,
      inStock: true,
    });
  });

  it.each([0, -1])('rejects price %d', (price) => {
    expect(PricePoint.safeParse({ at: '2026-10-26T08:00:00Z', price }).success).toBe(false);
  });
});

describe('PriceFile', () => {
  it('defaults consecutiveFailures to 0', () => {
    expect(PriceFile.parse(minimalPriceFile).consecutiveFailures).toBe(0);
  });

  it('rejects a bad imageUrl', () => {
    expect(PriceFile.safeParse({ ...minimalPriceFile, imageUrl: 'nope' }).success).toBe(false);
  });

  it('rejects a non-integer consecutiveFailures', () => {
    expect(PriceFile.safeParse({ ...minimalPriceFile, consecutiveFailures: 1.5 }).success).toBe(
      false,
    );
  });

  it('rejects a non-positive price in history', () => {
    const history = [{ at: '2026-10-26T08:00:00Z', price: 0 }];
    expect(PriceFile.safeParse({ ...minimalPriceFile, history }).success).toBe(false);
  });
});

describe('inferred types', () => {
  it('match the schemas', () => {
    expectTypeOf<Product['minDropPercent']>().toEqualTypeOf<number>();
    expectTypeOf<Product['targetPrice']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<ProductsFile['version']>().toEqualTypeOf<1>();
    expectTypeOf<ProductsFile['currency']>().toEqualTypeOf<'ZAR'>();
    expectTypeOf<PriceFile['history']>().toEqualTypeOf<PricePoint[]>();
    expectTypeOf<PriceFile['consecutiveFailures']>().toEqualTypeOf<number>();
  });
});
