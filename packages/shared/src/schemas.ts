import { z } from 'zod';

export const Product = z.object({
  id: z.string(), // nanoid, stable, used in file names
  url: z.string().url(),
  name: z.string().min(1).optional(), // user override; else scraped title
  shop: z.string(), // hostname, e.g. takealot.com
  forWhom: z.string().optional(), // e.g. "Dad"
  targetPrice: z.number().positive().optional(), // alert when price <= this
  minDropPercent: z.number().min(0).max(100).default(5),
  selector: z.string().optional(), // CSS selector override for stubborn sites
  useBrowser: z.boolean().default(false), // Playwright fallback
  bought: z.boolean().default(false),
  addedAt: z.string().datetime(),
});
export type Product = z.infer<typeof Product>;

export const ProductsFile = z.object({
  version: z.literal(1),
  currency: z.literal('ZAR'),
  products: z.array(Product),
});
export type ProductsFile = z.infer<typeof ProductsFile>;

export const PricePoint = z.object({
  at: z.string().datetime(),
  price: z.number().positive(),
  inStock: z.boolean().optional(),
});
export type PricePoint = z.infer<typeof PricePoint>;

export const PriceFile = z.object({
  productId: z.string(),
  title: z.string().optional(), // scraped product title
  imageUrl: z.string().url().optional(), // scraped product image
  history: z.array(PricePoint), // appended only when the price changes
  lastCheckedAt: z.string().datetime(),
  lastError: z.string().optional(), // set when extraction fails, cleared on success
  consecutiveFailures: z.number().int().default(0),
  lastAlertedPrice: z.number().optional(),
  issueNumber: z.number().int().optional(), // GitHub Issue for this product
});
export type PriceFile = z.infer<typeof PriceFile>;
