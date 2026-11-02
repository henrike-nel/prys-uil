import { describe, expect, it } from 'vitest';
import { normalizeUrl } from '../src/url';

describe('normalizeUrl', () => {
  it('strips utm_* params', () => {
    expect(normalizeUrl('https://shop.example/item?utm_source=x&utm_medium=y&utm_campaign=z')).toBe(
      'https://shop.example/item',
    );
  });

  it.each(['gclid', 'fbclid', 'msclkid', 'mc_cid', 'mc_eid'])('strips %s', (param) => {
    expect(normalizeUrl(`https://shop.example/item?${param}=abc`)).toBe(
      'https://shop.example/item',
    );
  });

  it('strips tracking params regardless of case', () => {
    expect(normalizeUrl('https://shop.example/item?UTM_Source=x&UTM_Campaign=y')).toBe(
      'https://shop.example/item',
    );
    expect(normalizeUrl('https://shop.example/item?GCLID=1')).toBe('https://shop.example/item');
  });

  it('keeps other params in their original order', () => {
    expect(normalizeUrl('https://shop.example/item?size=10&utm_source=x&colour=red&gclid=1')).toBe(
      'https://shop.example/item?size=10&colour=red',
    );
  });

  it('encodes the query the same way with or without tracking params', () => {
    expect(normalizeUrl('https://shop.example/a?colour=red,blue&utm_source=x')).toBe(
      normalizeUrl('https://shop.example/a?colour=red,blue'),
    );
    expect(normalizeUrl('https://shop.example/a?q=two%20words&gclid=1')).toBe(
      normalizeUrl('https://shop.example/a?q=two%20words'),
    );
  });

  it('strips the fragment', () => {
    expect(normalizeUrl('https://shop.example/item?id=1#reviews')).toBe(
      'https://shop.example/item?id=1',
    );
  });

  it('strips a trailing slash from the path', () => {
    expect(normalizeUrl('https://shop.example/item/')).toBe('https://shop.example/item');
    expect(normalizeUrl('https://shop.example/item/?id=1')).toBe('https://shop.example/item?id=1');
    expect(normalizeUrl('https://shop.example/item//')).toBe('https://shop.example/item');
  });

  it('keeps a bare / path', () => {
    expect(normalizeUrl('https://shop.example/')).toBe('https://shop.example/');
    expect(normalizeUrl('https://shop.example')).toBe('https://shop.example/');
    expect(normalizeUrl('https://shop.example//')).toBe('https://shop.example/');
  });

  it('lowercases the host', () => {
    expect(normalizeUrl('https://Shop.EXAMPLE/Item')).toBe('https://shop.example/Item');
  });

  it('treats tracking variants of the same URL as duplicates', () => {
    expect(normalizeUrl('https://shop.example/item/?utm_source=x#top')).toBe(
      normalizeUrl('https://shop.example/item'),
    );
  });

  it('is idempotent', () => {
    const normalised = [
      'https://shop.example/',
      'https://shop.example/item?size=10&colour=red',
      'https://shop.example/a/b/c',
    ];
    for (const url of normalised) {
      expect(normalizeUrl(url)).toBe(url);
    }
    const messy = [
      'https://shop.example/a//?utm_source=x#top',
      'https://shop.example/a?colour=red,blue&q=two%20words&fbclid=1',
      'https://shop.example/a/?q=a+b&x=%2F',
      'https://shop.example//',
    ];
    for (const url of messy) {
      expect(normalizeUrl(normalizeUrl(url))).toBe(normalizeUrl(url));
    }
  });
});
