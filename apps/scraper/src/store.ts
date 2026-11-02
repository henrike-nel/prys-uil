import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PriceFile, ProductsFile } from '@prysuil/shared';

export const DATA_DIR = fileURLToPath(new URL('../../../data', import.meta.url));

export async function readProducts(dataDir: string): Promise<ProductsFile> {
  const json = await readJson(join(dataDir, 'products.json'));
  return ProductsFile.parse(json ?? { version: 1, currency: 'ZAR', products: [] });
}

export async function readPriceFiles(dataDir: string): Promise<Map<string, PriceFile>> {
  const dir = join(dataDir, 'prices');
  const names = await readdir(dir).catch((error) =>
    isMissing(error) ? [] : Promise.reject(error),
  );
  const files = new Map<string, PriceFile>();
  for (const name of names.filter((name) => name.endsWith('.json'))) {
    try {
      const file = PriceFile.parse(await readJson(join(dir, name)));
      files.set(file.productId, file);
    } catch (error) {
      console.log(
        `Skipping invalid price file ${name}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  return files;
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
