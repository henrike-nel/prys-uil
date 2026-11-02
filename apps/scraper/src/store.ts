import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PriceFile, ProductsFile } from '@prysuil/shared';

export const DATA_DIR = fileURLToPath(new URL('../../../data', import.meta.url));

export async function readProducts(dataDir: string): Promise<ProductsFile> {
  const json = await readJson(join(dataDir, 'products.json'));
  return ProductsFile.parse(json ?? { version: 1, currency: 'ZAR', products: [] });
}

export interface PriceFiles {
  files: Map<string, PriceFile>;
  // Filenames (productIds) whose content failed validation. Callers should leave
  // these alone rather than overwrite or silently treat the product as new.
  invalidIds: Set<string>;
}

export async function readPriceFiles(dataDir: string): Promise<PriceFiles> {
  const dir = join(dataDir, 'prices');
  const names = await readdir(dir).catch((error) =>
    isMissing(error) ? [] : Promise.reject(error),
  );
  const files = new Map<string, PriceFile>();
  const invalidIds = new Set<string>();
  for (const name of names.filter((name) => name.endsWith('.json'))) {
    const productId = name.slice(0, -'.json'.length);
    let json: unknown;
    try {
      json = await readJson(join(dir, name));
    } catch (error) {
      // A malformed JSON file is invalid content, not a missing/permission error.
      if (!(error instanceof SyntaxError)) throw error;
      console.log(`Skipping invalid price file ${name}: ${error.message}`);
      invalidIds.add(productId);
      continue;
    }
    const parsed = PriceFile.safeParse(json);
    if (parsed.success) {
      files.set(parsed.data.productId, parsed.data);
    } else {
      console.log(`Skipping invalid price file ${name}: ${parsed.error.message}`);
      invalidIds.add(productId);
    }
  }
  return { files, invalidIds };
}

export async function writePriceFile(dataDir: string, file: PriceFile): Promise<void> {
  const valid = PriceFile.parse(file);
  await mkdir(join(dataDir, 'prices'), { recursive: true });
  await writeFile(priceFilePath(dataDir, valid.productId), JSON.stringify(valid, null, 2) + '\n');
}

export async function deletePriceFile(dataDir: string, productId: string): Promise<void> {
  await rm(priceFilePath(dataDir, productId), { force: true });
}

function priceFilePath(dataDir: string, productId: string): string {
  return join(dataDir, 'prices', `${productId}.json`);
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}
