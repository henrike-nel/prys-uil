import { describe, expect, it } from 'vitest';
import { parsePrice } from '../src/price';

const nbsp = ' ';
const narrowNbsp = ' ';

describe('parsePrice', () => {
  it.each([
    ['R 1 299,00', 1299],
    ['R1,299.00', 1299],
    ['1299', 1299],
    ['R1 299', 1299],
  ])('parses the spec format %s', (raw, price) => {
    expect(parsePrice(raw)).toEqual({ price });
  });

  it.each([
    [`R${nbsp}1${nbsp}299,00`, 1299],
    [`R${nbsp}1${nbsp}299`, 1299],
    [`R${narrowNbsp}1${narrowNbsp}299,00`, 1299],
    [`R1${narrowNbsp}299`, 1299],
  ])('handles non-breaking spaces in %j', (raw, price) => {
    expect(parsePrice(raw)).toEqual({ price });
  });

  it.each([
    ['ZAR 1299', 1299],
    ['ZAR1 299,50', 1299.5],
    ['1 299.00 ZAR', 1299],
    ['  R 1 299,00  \n', 1299],
    ['r99', 99],
    ['R12 345 678,90', 12345678.9],
  ])('parses %j', (raw, price) => {
    expect(parsePrice(raw)).toEqual({ price });
  });

  describe('separator rule', () => {
    it.each([
      ['1,299', 1299],
      ['1.299', 1299],
      ['1,299,999', 1299999],
      ['1299,50', 1299.5],
      ['1299,5', 1299.5],
      ['12.99', 12.99],
      ['1.299,99', 1299.99],
      ['1,299.99', 1299.99],
    ])('%s -> %d', (raw, price) => {
      expect(parsePrice(raw)).toEqual({ price });
    });
  });

  it.each([
    ['$12.99', 'currency USD'],
    ['US$ 12', 'currency USD'],
    ['USD 12.99', 'currency USD'],
    ['12.99 usd', 'currency USD'],
    ['€12,99', 'currency EUR'],
    ['EUR 12,99', 'currency EUR'],
    ['£12.99', 'currency GBP'],
    ['12.99 GBP', 'currency GBP'],
  ])('rejects non-ZAR %j', (raw, error) => {
    expect(parsePrice(raw)).toEqual({ error });
  });

  it.each([
    '',
    '   ',
    'Call for price',
    'R',
    'R0',
    'R0,00',
    '0',
    '-R5',
    'R-5',
    '-5',
    'R12abc',
    '1.2.3,4.5',
    '1,299,99',
    'R 1 299,00 - R 1 499,00',
    '9'.repeat(400),
  ])('returns no price found for %j', (raw) => {
    expect(parsePrice(raw)).toEqual({ error: 'no price found' });
  });
});
