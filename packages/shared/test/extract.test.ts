import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractImage, extractPrice, extractTitle } from '../src/extract';

function fixture(name: string): string {
  return readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8');
}

function jsonLd(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

function productWithOffer(offer: Record<string, unknown>): string {
  return jsonLd({ '@type': 'Product', offers: { '@type': 'Offer', ...offer } });
}

describe('extractPrice', () => {
  describe('selector override', () => {
    it('finds the price only the selector can see', () => {
      expect(extractPrice(fixture('selector-override.html'), '.price')).toEqual({ price: 1299 });
    });

    it('wins over JSON-LD', () => {
      expect(extractPrice(fixture('jsonld-product.html'), '.sale-price')).toEqual({ price: 1199 });
    });

    it('prefers the content attribute over text', () => {
      const html = '<span class="price" content="999.00">R 1 299,00</span>';
      expect(extractPrice(html, '.price')).toEqual({ price: 999 });
    });

    it('falls through when the selector matches nothing', () => {
      expect(extractPrice(fixture('jsonld-product.html'), '.missing')).toEqual({
        price: 1299,
        inStock: true,
      });
    });

    it('stops with an error when the matched text is not a price', () => {
      expect(extractPrice(fixture('jsonld-product.html'), 'h1')).toEqual({
        error: 'no price found',
      });
    });

    it('returns an error for an invalid selector instead of throwing', () => {
      expect(extractPrice(fixture('jsonld-product.html'), '[[nope')).toEqual({
        error: 'invalid selector',
      });
    });

    it('finds nothing on that page without the selector', () => {
      expect(extractPrice(fixture('selector-override.html'))).toEqual({
        error: 'no price found',
      });
    });
  });

  describe('JSON-LD', () => {
    it('reads a Product offer and wins over meta tags', () => {
      expect(extractPrice(fixture('jsonld-product.html'))).toEqual({ price: 1299, inStock: true });
    });

    it('uses lowPrice for an AggregateOffer', () => {
      expect(extractPrice(fixture('jsonld-aggregate-offer.html'))).toEqual({
        price: 899,
        inStock: false,
      });
    });

    it('finds a Product in @graph and takes the first offer with a price', () => {
      expect(extractPrice(fixture('jsonld-graph.html'))).toEqual({ price: 1299 });
    });

    it('finds a Product in a top-level array', () => {
      expect(extractPrice(fixture('jsonld-array.html'))).toEqual({ price: 549.95, inStock: true });
    });

    it('rejects a non-ZAR currency without falling through to ZAR meta tags', () => {
      expect(extractPrice(fixture('non-zar-currency.html'))).toEqual({ error: 'currency USD' });
    });

    it('skips malformed JSON-LD and falls through to meta tags', () => {
      expect(extractPrice(fixture('malformed-jsonld.html'))).toEqual({ price: 799 });
    });

    it.each([
      ['https://schema.org/InStock', true],
      ['http://schema.org/InStock', true],
      ['InStock', true],
      ['https://schema.org/OutOfStock', false],
      ['https://schema.org/PreOrder', false],
    ])('maps availability %s to inStock %s', (availability, inStock) => {
      expect(extractPrice(productWithOffer({ price: 100, availability }))).toEqual({
        price: 100,
        inStock,
      });
    });

    it('uses lowPrice when @type is an array containing AggregateOffer', () => {
      const html = productWithOffer({ '@type': ['AggregateOffer'], price: 1099, lowPrice: 899 });
      expect(extractPrice(html)).toEqual({ price: 899 });
    });

    it('uses price for an AggregateOffer without lowPrice', () => {
      expect(extractPrice(productWithOffer({ '@type': 'AggregateOffer', price: 10 }))).toEqual({
        price: 10,
      });
    });

    it('matches a Product @type given as a schema.org URL', () => {
      const html = jsonLd({ '@type': 'https://schema.org/Product', offers: { price: 42 } });
      expect(extractPrice(html)).toEqual({ price: 42 });
    });

    it('treats a null priceCurrency as absent', () => {
      expect(extractPrice(productWithOffer({ price: 100, priceCurrency: null }))).toEqual({
        price: 100,
      });
    });

    it('accepts priceCurrency with stray case and whitespace', () => {
      expect(extractPrice(productWithOffer({ price: 100, priceCurrency: ' zar ' }))).toEqual({
        price: 100,
      });
    });

    it('leaves inStock undefined for a null availability', () => {
      expect(extractPrice(productWithOffer({ price: 100, availability: null }))).toEqual({
        price: 100,
      });
    });

    it('rejects a non-finite price', () => {
      const html =
        '<script type="application/ld+json">{"@type":"Product","offers":{"price":1e400}}</script>';
      expect(extractPrice(html)).toEqual({ error: 'no price found' });
    });

    it('leaves inStock undefined without availability', () => {
      const result = extractPrice(productWithOffer({ price: 100 }));
      expect(result).toEqual({ price: 100 });
      expect(result).not.toHaveProperty('inStock');
    });

    it.each([0, -5, '0,00', 'Sold out'])('stops with no price found for price %j', (price) => {
      const html = productWithOffer({ price }) + '<meta property="og:price:amount" content="99">';
      expect(extractPrice(html)).toEqual({ error: 'no price found' });
    });

    it('falls through when the Product has no priced offer', () => {
      const html = jsonLd({ '@type': 'Product', name: 'x' }) + '<span itemprop="price">R50</span>';
      expect(extractPrice(html)).toEqual({ price: 50 });
    });

    it('ignores JSON-LD that is not a Product', () => {
      const html =
        jsonLd({ '@type': 'Offer', price: 10 }) + '<meta property="og:price:amount" content="99">';
      expect(extractPrice(html)).toEqual({ price: 99 });
    });
  });

  describe('meta tags', () => {
    it('reads product:price:amount', () => {
      expect(extractPrice(fixture('meta-tags.html'))).toEqual({ price: 1299 });
    });

    it('reads og:price:amount and checks og:price:currency', () => {
      const amount = '<meta property="og:price:amount" content="12.99">';
      expect(extractPrice(amount)).toEqual({ price: 12.99 });
      expect(extractPrice(amount + '<meta property="og:price:currency" content="EUR">')).toEqual({
        error: 'currency EUR',
      });
    });

    it('falls through to microdata when the amount is empty', () => {
      const html =
        '<meta property="product:price:amount" content=""><span itemprop="price">R50</span>';
      expect(extractPrice(html)).toEqual({ price: 50 });
    });

    it('stops on a bad amount instead of falling through to microdata', () => {
      const html =
        '<meta property="product:price:amount" content="TBA"><span itemprop="price">R50</span>';
      expect(extractPrice(html)).toEqual({ error: 'no price found' });
    });
  });

  describe('microdata', () => {
    it('prefers the content attribute', () => {
      expect(extractPrice(fixture('microdata.html'))).toEqual({ price: 1299 });
    });

    it('falls back to the text', () => {
      expect(extractPrice('<span itemprop="price"> R 1 299,00 </span>')).toEqual({ price: 1299 });
    });

    it('falls back to the text when content is empty', () => {
      expect(extractPrice('<span itemprop="price" content="">R 7</span>')).toEqual({ price: 7 });
    });

    it('rejects a non-ZAR priceCurrency', () => {
      const html = '<span itemprop="priceCurrency">GBP</span><span itemprop="price">12.99</span>';
      expect(extractPrice(html)).toEqual({ error: 'currency GBP' });
    });
  });

  it('returns no price found when nothing matches', () => {
    expect(extractPrice(fixture('no-price.html'))).toEqual({ error: 'no price found' });
    expect(extractPrice('')).toEqual({ error: 'no price found' });
    expect(extractPrice('<<<not html')).toEqual({ error: 'no price found' });
  });
});

describe('extractTitle', () => {
  it('prefers the JSON-LD Product name', () => {
    expect(extractTitle(fixture('jsonld-product.html'))).toBe('Noise Cancelling Headphones');
  });

  it('falls back to og:title', () => {
    expect(extractTitle(fixture('jsonld-array.html'))).toBe('Stainless Steel Kettle');
    expect(extractTitle(fixture('malformed-jsonld.html'))).toBe('Blender');
  });

  it('falls back to <title>', () => {
    expect(extractTitle(fixture('microdata.html'))).toBe('Backpack | Example Shop');
  });

  it('skips empty values', () => {
    const html =
      jsonLd({ '@type': 'Product', name: ' ' }) +
      '<meta property="og:title" content=""><title>  Fallback  </title>';
    expect(extractTitle(html)).toBe('Fallback');
  });

  it('returns undefined when there is no title', () => {
    expect(extractTitle('<p>hello</p>')).toBeUndefined();
  });
});

describe('extractImage', () => {
  it('reads a JSON-LD image string', () => {
    expect(extractImage(fixture('jsonld-product.html'))).toBe(
      'https://shop.example/headphones.jpg',
    );
  });

  it('takes the first image from an array', () => {
    expect(extractImage(fixture('jsonld-aggregate-offer.html'))).toBe(
      'https://shop.example/grinder-1.jpg',
    );
  });

  it('reads the url of an ImageObject', () => {
    expect(extractImage(fixture('jsonld-graph.html'))).toBe('https://shop.example/lamp.jpg');
  });

  it('falls back to og:image', () => {
    expect(extractImage(fixture('meta-tags.html'))).toBe('https://shop.example/shoes.jpg');
    const html =
      jsonLd({ '@type': 'Product', name: 'No image' }) +
      '<meta property="og:image" content="https://shop.example/og.jpg">';
    expect(extractImage(html)).toBe('https://shop.example/og.jpg');
  });

  it('returns undefined when there is no image', () => {
    expect(extractImage(fixture('microdata.html'))).toBeUndefined();
  });
});
