import { load, type CheerioAPI } from 'cheerio';
import { parsePrice } from './price';

export type ExtractResult = { price: number; inStock?: boolean } | { error: string };

type JsonObject = Record<string, unknown>;

// Each strategy returns undefined when the page has no price field for it, so
// the next one is tried. A field that is present but bad is a final error.
type Strategy = ($: CheerioAPI) => ExtractResult | undefined;

export function extractPrice(html: string, selector?: string): ExtractResult {
  const $ = load(html);
  const strategies: Strategy[] = [fromJsonLd, fromMetaTags, fromMicrodata];
  if (selector) strategies.unshift(($) => fromSelector($, selector));
  for (const strategy of strategies) {
    const result = strategy($);
    if (result) return result;
  }
  return { error: 'no price found' };
}

export function extractTitle(html: string): string | undefined {
  const $ = load(html);
  return firstText([
    ...jsonLdProducts($).map((product) => product.name),
    meta($, 'og:title'),
    $('title').first().text(),
  ]);
}

export function extractImage(html: string): string | undefined {
  const $ = load(html);
  return firstText([
    ...jsonLdProducts($).map((product) => imageUrl(product.image)),
    meta($, 'og:image'),
  ]);
}

function fromSelector($: CheerioAPI, selector: string): ExtractResult | undefined {
  try {
    const value = valueAt($, selector);
    return value === undefined ? undefined : toResult(value);
  } catch {
    return { error: 'invalid selector' };
  }
}

function fromJsonLd($: CheerioAPI): ExtractResult | undefined {
  const offers = jsonLdProducts($).flatMap((product) => [product.offers].flat().filter(isObject));
  for (const offer of offers) {
    const aggregate = [offer['@type']].flat().includes('AggregateOffer');
    const value = aggregate ? (offer.lowPrice ?? offer.price) : offer.price;
    if (typeof value !== 'number' && typeof value !== 'string') continue;
    const inStock =
      offer.availability == null
        ? undefined
        : /^(https?:\/\/schema\.org\/)?InStock$/.test(String(offer.availability));
    return toResult(value, offer.priceCurrency, inStock);
  }
  return undefined;
}

function fromMetaTags($: CheerioAPI): ExtractResult | undefined {
  const amount = meta($, 'product:price:amount') ?? meta($, 'og:price:amount');
  if (amount === undefined) return undefined;
  return toResult(amount, meta($, 'product:price:currency') ?? meta($, 'og:price:currency'));
}

function fromMicrodata($: CheerioAPI): ExtractResult | undefined {
  const value = valueAt($, '[itemprop=price]');
  if (value === undefined) return undefined;
  return toResult(value, valueAt($, '[itemprop=priceCurrency]'));
}

function toResult(value: string | number, currency?: unknown, inStock?: boolean): ExtractResult {
  if (typeof currency === 'string' && currency.trim()) {
    const code = currency.trim().toUpperCase();
    if (code !== 'ZAR') return { error: `currency ${code}` };
  }
  if (typeof value === 'number' && !(Number.isFinite(value) && value > 0))
    return { error: 'no price found' };
  const parsed = typeof value === 'number' ? { price: value } : parsePrice(value);
  if ('error' in parsed || inStock === undefined) return parsed;
  return { ...parsed, inStock };
}

function jsonLdProducts($: CheerioAPI): JsonObject[] {
  const products: JsonObject[] = [];
  $('script[type="application/ld+json"]').each((_, script) => {
    let data: unknown;
    try {
      data = JSON.parse($(script).text());
    } catch {
      return;
    }
    for (const node of [data].flat().filter(isObject)) {
      const graph = Array.isArray(node['@graph']) ? node['@graph'].filter(isObject) : [];
      products.push(...[node, ...graph].filter(isProduct));
    }
  });
  return products;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProduct(node: JsonObject): boolean {
  return [node['@type']]
    .flat()
    .some((type) => String(type).replace(/^https?:\/\/schema\.org\//, '') === 'Product');
}

function imageUrl(image: unknown): unknown {
  const first: unknown = Array.isArray(image) ? image[0] : image;
  return isObject(first) ? first.url : first;
}

function meta($: CheerioAPI, property: string): string | undefined {
  return $(`meta[property="${property}"]`).attr('content') || undefined;
}

function valueAt($: CheerioAPI, selector: string): string | undefined {
  const element = $(selector).first();
  if (element.length === 0) return undefined;
  return element.attr('content') || element.text().trim();
}

function firstText(values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}
