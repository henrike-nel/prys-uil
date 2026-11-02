import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PriceFile } from '@prysuil/shared';
import { deletePriceFile, readPriceFiles, readProducts, writePriceFile } from '../src/store';

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'prysuil-store-'));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

const file = PriceFile.parse({
  productId: 'p1',
  title: 'Headphones',
  history: [{ at: '2026-10-01T00:00:00.000Z', price: 1299, inStock: true }],
  lastCheckedAt: '2026-10-02T00:00:00.000Z',
  issueNumber: 3,
});

describe('store', () => {
  it('treats a missing products.json and prices folder as empty', async () => {
    await expect(readProducts(dataDir)).resolves.toEqual({
      version: 1,
      currency: 'ZAR',
      products: [],
    });
    await expect(readPriceFiles(dataDir)).resolves.toEqual(new Map());
  });

  it('reads and validates products.json', async () => {
    writeFileSync(
      join(dataDir, 'products.json'),
      JSON.stringify({
        version: 1,
        currency: 'ZAR',
        products: [
          {
            id: 'p1',
            url: 'https://a.example/',
            shop: 'a.example',
            addedAt: '2026-10-01T00:00:00Z',
          },
        ],
      }),
    );

    const { products } = await readProducts(dataDir);

    expect(products[0]).toMatchObject({ id: 'p1', bought: false, useBrowser: false });
  });

  it('round-trips a price file', async () => {
    await writePriceFile(dataDir, file);

    const raw = readFileSync(join(dataDir, 'prices', 'p1.json'), 'utf8');
    expect(raw).toBe(JSON.stringify(file, null, 2) + '\n');
    expect((await readPriceFiles(dataDir)).get('p1')).toEqual(file);
  });

  it('skips an invalid price file on read instead of aborting the whole directory', async () => {
    mkdirSync(join(dataDir, 'prices'));
    writeFileSync(join(dataDir, 'prices', 'bad.json'), JSON.stringify({ productId: 'bad' }));
    await writePriceFile(dataDir, file);

    const files = await readPriceFiles(dataDir);

    expect(files.get('p1')).toEqual(file);
    expect(files.has('bad')).toBe(false);
  });

  it('rejects an invalid price file on write', async () => {
    await expect(
      writePriceFile(dataDir, { ...file, history: [{ at: 'yesterday', price: -1 }] }),
    ).rejects.toThrow();
  });

  it('deletes a price file', async () => {
    await writePriceFile(dataDir, file);

    await deletePriceFile(dataDir, 'p1');

    expect(existsSync(join(dataDir, 'prices', 'p1.json'))).toBe(false);
  });
});
