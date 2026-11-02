import type { PriceFile, Product, ProductsFile } from '@prysuil/shared';
import { displayName } from './format';
import { createRepo } from './github';

const tokenKey = 'prysuil.token';

export const app = $state({
  products: [] as Product[],
  priceFiles: {} as Record<string, PriceFile>,
  token: localStorage.getItem(tokenKey),
  loading: false,
  error: undefined as string | undefined,
});

export function setToken(token: string) {
  localStorage.setItem(tokenKey, token);
  app.token = token;
  void load();
}

export function clearToken() {
  localStorage.removeItem(tokenKey);
  app.token = null;
}

export async function load() {
  app.loading = true;
  app.error = undefined;
  try {
    const repo = createRepo(app.token);
    const { file } = await repo.readProducts();
    app.products = file.products;
    await Promise.all(
      file.products.map(async (product) => {
        const priceFile = await repo.readPriceFile(product.id);
        if (priceFile) app.priceFiles[product.id] = priceFile;
      }),
    );
  } catch (error) {
    app.error = errorMessage(error);
  } finally {
    app.loading = false;
  }
}

async function commit(apply: (file: ProductsFile) => ProductsFile, message: string) {
  const { file } = await createRepo(app.token).commitChange(apply, message);
  app.products = file.products;
}

export function addProduct(product: Product) {
  return commit(
    (file) => ({ ...file, products: [...file.products, product] }),
    `chore(data): add ${displayName(product)}`,
  );
}

export function editProduct(product: Product) {
  return commit(
    (file) => ({
      ...file,
      products: file.products.map((p) => (p.id === product.id ? product : p)),
    }),
    `chore(data): edit ${displayName(product, app.priceFiles[product.id])}`,
  );
}

export function deleteProduct(product: Product) {
  return commit(
    (file) => ({ ...file, products: file.products.filter((p) => p.id !== product.id) }),
    `chore(data): delete ${displayName(product, app.priceFiles[product.id])}`,
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
