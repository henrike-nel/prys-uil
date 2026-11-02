import { Octokit } from '@octokit/rest';
import { PriceFile, ProductsFile } from '@prysuil/shared';

export const owner: string = import.meta.env.VITE_REPO_OWNER || 'henrike-nel';
export const repo: string = import.meta.env.VITE_REPO_NAME || 'prys-uil';
export const saveFailed = "Couldn't save. Reload and try again.";

const productsPath = 'data/products.json';
const emptyProducts: ProductsFile = { version: 1, currency: 'ZAR', products: [] };

export function createOctokit(token: string): Octokit {
  return new Octokit({
    auth: token,
    // The API sends max-age=60, so without this a re-read after a write can see the old sha.
    request: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  });
}

export async function testToken(octokit: Octokit): Promise<void> {
  try {
    await octokit.rest.repos.getContent({ owner, repo, path: productsPath });
  } catch (error) {
    // No products.json yet still proves the token authenticates.
    if (status(error) !== 404) throw error;
  }
}

// Reads go through the API with a token and raw.githubusercontent.com without one.
export function createRepo(
  token: string | null,
  octokit: Octokit | null = token ? createOctokit(token) : null,
) {
  async function readJson(
    path: string,
  ): Promise<{ json: unknown; sha: string | null } | undefined> {
    if (!octokit) {
      const response = await fetch(
        `https://raw.githubusercontent.com/${owner}/${repo}/main/${path}`,
      );
      if (response.status === 404) return undefined;
      if (!response.ok) throw new Error(`Couldn't load ${path} (HTTP ${response.status}).`);
      return { json: await response.json(), sha: null };
    }
    try {
      const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
      if (Array.isArray(data) || data.type !== 'file') throw new Error(`${path} is not a file.`);
      return { json: JSON.parse(decodeBase64(data.content)), sha: data.sha };
    } catch (error) {
      if (status(error) === 404) return undefined;
      throw error;
    }
  }

  async function readProducts(): Promise<{ file: ProductsFile; sha: string | null }> {
    const result = await readJson(productsPath);
    if (!result) return { file: emptyProducts, sha: null };
    return { file: ProductsFile.parse(result.json), sha: result.sha };
  }

  async function readPriceFile(productId: string): Promise<PriceFile | undefined> {
    const result = await readJson(`data/prices/${productId}.json`);
    return result && PriceFile.parse(result.json);
  }

  async function writeProducts(
    file: ProductsFile,
    sha: string | null,
    message: string,
  ): Promise<string | null> {
    const content = JSON.stringify(ProductsFile.parse(file), null, 2) + '\n';
    if (!octokit) throw new Error('Add a GitHub token in Settings to make changes.');
    const { data } = await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: productsPath,
      message,
      content: encodeBase64(content),
      ...(sha ? { sha } : {}),
    });
    return data.content?.sha ?? null;
  }

  // Reads the latest file, applies the change and writes it. If someone else
  // changed the file in between, the same change is applied to their version once.
  async function commitChange(
    apply: (file: ProductsFile) => ProductsFile,
    message: string,
  ): Promise<{ file: ProductsFile; sha: string | null }> {
    const first = await readProducts();
    try {
      const file = apply(first.file);
      return { file, sha: await writeProducts(file, first.sha, message) };
    } catch (error) {
      if (status(error) !== 409 && status(error) !== 422) throw error;
    }
    try {
      const fresh = await readProducts();
      const file = apply(fresh.file);
      return { file, sha: await writeProducts(file, fresh.sha, message) };
    } catch (error) {
      throw new Error(saveFailed, { cause: error });
    }
  }

  return { readProducts, readPriceFile, writeProducts, commitChange };
}

function status(error: unknown): unknown {
  return (error as { status?: unknown } | null)?.status;
}

function decodeBase64(base64: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
}

function encodeBase64(text: string): string {
  return btoa(Array.from(new TextEncoder().encode(text), (b) => String.fromCharCode(b)).join(''));
}
