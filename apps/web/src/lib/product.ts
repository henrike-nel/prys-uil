import { normalizeUrl, Product } from '@prysuil/shared';

// What the add and edit dialogs bind to. Empty strings mean "not set".
export type ProductForm = {
  url: string;
  forWhom: string;
  targetPrice: number | undefined;
  minDropPercent: number | undefined;
  name: string;
  selector: string;
  useBrowser: boolean;
  bought: boolean;
};

export function emptyForm(): ProductForm {
  return {
    url: '',
    forWhom: '',
    targetPrice: undefined,
    minDropPercent: 5,
    name: '',
    selector: '',
    useBrowser: false,
    bought: false,
  };
}

export function formFrom(product: Product): ProductForm {
  return {
    url: product.url,
    forWhom: product.forWhom ?? '',
    targetPrice: product.targetPrice,
    minDropPercent: product.minDropPercent,
    name: product.name ?? '',
    selector: product.selector ?? '',
    useBrowser: product.useBrowser,
    bought: product.bought,
  };
}

// The link as-is when it is http(s), so javascript: URLs never become links.
export function webUrl(url: string): string | undefined {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

export function urlError(url: string, products: Product[], exceptId?: string): string | undefined {
  if (!webUrl(url.trim())) return 'Enter a valid link starting with http:// or https://.';
  const normalized = normalizeUrl(url.trim());
  const duplicate = products.some((p) => p.id !== exceptId && normalizeUrl(p.url) === normalized);
  if (duplicate) return 'This product is already on the list.';
  return undefined;
}

export function toProduct(form: ProductForm, base: Pick<Product, 'id' | 'addedAt'>): Product {
  const url = normalizeUrl(form.url.trim());
  return Product.parse({
    ...base,
    url,
    shop: new URL(url).hostname.replace(/^www\./, ''),
    name: form.name.trim() || undefined,
    forWhom: form.forWhom.trim() || undefined,
    targetPrice: form.targetPrice || undefined,
    minDropPercent: form.minDropPercent,
    selector: form.selector.trim() || undefined,
    useBrowser: form.useBrowser,
    bought: form.bought,
  });
}
