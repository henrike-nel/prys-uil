import type { Octokit } from '@octokit/rest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Product, type ProductsFile } from '@prysuil/shared';
import { createRepo, testToken } from '../src/lib/github';

type Call = [{ content: string; sha?: string; message: string }];

function product(id: string, name?: string): Product {
  return Product.parse({
    id,
    url: `https://shop.example/${id}`,
    name,
    shop: 'shop.example',
    addedAt: '2026-10-01T00:00:00Z',
  });
}

function productsFile(...products: Product[]): ProductsFile {
  return { version: 1, currency: 'ZAR', products };
}

function encode(json: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(json));
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
}

function decode(base64: string): ProductsFile {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function content(json: unknown, sha: string) {
  return { data: { type: 'file', content: encode(json), sha } };
}

function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

function setup() {
  const repos = {
    getContent: vi.fn<(params: { path: string }) => Promise<object>>(),
    createOrUpdateFileContents: vi.fn<(params: object) => Promise<object>>(async () => ({
      data: { content: { sha: 'new-sha' } },
    })),
  };
  const octokit = { rest: { repos } } as unknown as Octokit;
  const written = (i: number) => (repos.createOrUpdateFileContents.mock.calls[i] as Call)[0];
  return { repos, octokit, written, repo: createRepo('token', octokit) };
}

const add = (p: Product) => (file: ProductsFile) => ({
  ...file,
  products: [...file.products, p],
});

describe('with a token', () => {
  it('reads and parses products.json and keeps the sha', async () => {
    const { repos, repo } = setup();
    const stored = productsFile(product('a', 'Café'));
    // GitHub wraps base64 content at 60 columns
    const wrapped = encode(stored).replace(/(.{60})/g, '$1\n');
    repos.getContent.mockResolvedValue({ data: { type: 'file', content: wrapped, sha: 'sha-1' } });

    const { file, sha } = await repo.readProducts();

    expect(repos.getContent).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'henrike-nel',
        repo: 'prys-uil',
        path: 'data/products.json',
      }),
    );
    expect(file.products[0]?.name).toBe('Café');
    expect(file.products[0]?.minDropPercent).toBe(5);
    expect(sha).toBe('sha-1');
  });

  it('treats a missing products.json as an empty list', async () => {
    const { repos, repo } = setup();
    repos.getContent.mockRejectedValue(httpError(404));

    expect(await repo.readProducts()).toEqual({ file: productsFile(), sha: null });
  });

  it('re-throws errors other than 404', async () => {
    const { repos, repo } = setup();
    repos.getContent.mockRejectedValue(httpError(401));

    await expect(repo.readProducts()).rejects.toThrow('HTTP 401');
  });

  it('fails loudly on invalid products.json', async () => {
    const { repos, repo } = setup();
    repos.getContent.mockResolvedValue(content({ version: 2 }, 'sha-1'));

    await expect(repo.readProducts()).rejects.toThrow();
  });

  it('reads a price file, or undefined when there is none yet', async () => {
    const { repos, repo } = setup();
    const priceFile = { productId: 'a', history: [], lastCheckedAt: '2026-10-01T00:00:00Z' };
    repos.getContent.mockResolvedValueOnce(content(priceFile, 'sha-p'));
    repos.getContent.mockRejectedValueOnce(httpError(404));

    expect(await repo.readPriceFile('a')).toEqual({ ...priceFile, consecutiveFailures: 0 });
    expect(await repo.readPriceFile('b')).toBeUndefined();
    expect(repos.getContent).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'data/prices/a.json' }),
    );
  });

  it('writes valid data with the sha and returns the new sha', async () => {
    const { repos, repo, written } = setup();

    const sha = await repo.writeProducts(productsFile(product('a', 'Café')), 'sha-1', 'msg');

    expect(sha).toBe('new-sha');
    expect(written(0)).toMatchObject({ path: 'data/products.json', message: 'msg', sha: 'sha-1' });
    expect(decode(written(0).content).products[0]?.name).toBe('Café');
    expect(repos.createOrUpdateFileContents).toHaveBeenCalledOnce();
  });

  it('creates the file without a sha', async () => {
    const { repo, written } = setup();

    await repo.writeProducts(productsFile(), null, 'msg');

    expect(written(0)).not.toHaveProperty('sha');
  });

  it('never sends invalid data', async () => {
    const { repos, repo } = setup();
    const invalid = productsFile({ ...product('a'), url: 'not a url' });

    await expect(repo.writeProducts(invalid, 'sha-1', 'msg')).rejects.toThrow();
    expect(repos.createOrUpdateFileContents).not.toHaveBeenCalled();
  });

  it('commits a change against the sha it just read', async () => {
    const { repos, repo, written } = setup();
    repos.getContent.mockResolvedValue(content(productsFile(product('a')), 'sha-1'));

    const result = await repo.commitChange(add(product('b')), 'chore(data): add b');

    expect(written(0).sha).toBe('sha-1');
    expect(written(0).message).toBe('chore(data): add b');
    expect(decode(written(0).content).products.map((p) => p.id)).toEqual(['a', 'b']);
    expect(result.sha).toBe('new-sha');
    expect(result.file.products.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it.each([409, 422])('re-applies the change to the fresh file after a %i', async (code) => {
    const { repos, repo, written } = setup();
    repos.getContent
      .mockResolvedValueOnce(content(productsFile(product('a')), 'sha-1'))
      .mockResolvedValueOnce(content(productsFile(product('a'), product('other')), 'sha-2'));
    repos.createOrUpdateFileContents.mockRejectedValueOnce(httpError(code));

    const result = await repo.commitChange(add(product('mine')), 'msg');

    expect(repos.createOrUpdateFileContents).toHaveBeenCalledTimes(2);
    expect(written(1).sha).toBe('sha-2');
    expect(decode(written(1).content).products.map((p) => p.id)).toEqual(['a', 'other', 'mine']);
    expect(result.sha).toBe('new-sha');
  });

  it('gives up after a second conflict', async () => {
    const { repos, repo } = setup();
    repos.getContent.mockResolvedValue(content(productsFile(), 'sha-1'));
    repos.createOrUpdateFileContents.mockRejectedValue(httpError(409));

    await expect(repo.commitChange(add(product('mine')), 'msg')).rejects.toThrow(
      new Error("Couldn't save. Reload and try again."),
    );
    expect(repos.createOrUpdateFileContents).toHaveBeenCalledTimes(2);
  });

  it('does not retry other errors', async () => {
    const { repos, repo } = setup();
    repos.getContent.mockResolvedValue(content(productsFile(), 'sha-1'));
    repos.createOrUpdateFileContents.mockRejectedValue(httpError(401));

    await expect(repo.commitChange(add(product('mine')), 'msg')).rejects.toThrow('HTTP 401');
    expect(repos.createOrUpdateFileContents).toHaveBeenCalledOnce();
  });
});

describe('testToken', () => {
  it('passes when the token can read the repo, even without products.json', async () => {
    const { repos, octokit } = setup();
    repos.getContent.mockResolvedValueOnce(content(productsFile(), 'sha-1'));
    repos.getContent.mockRejectedValueOnce(httpError(404));

    await expect(testToken(octokit)).resolves.toBeUndefined();
    await expect(testToken(octokit)).resolves.toBeUndefined();
  });

  it('fails on a bad token', async () => {
    const { repos, octokit } = setup();
    repos.getContent.mockRejectedValue(httpError(401));

    await expect(testToken(octokit)).rejects.toThrow('HTTP 401');
  });
});

describe('without a token', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(response: Response) {
    const fetch = vi.fn<(url: string) => Promise<Response>>(async () => response);
    vi.stubGlobal('fetch', fetch);
    return fetch;
  }

  it('reads products.json from raw.githubusercontent.com', async () => {
    const fetch = stubFetch(Response.json(productsFile(product('a'))));

    const { file, sha } = await createRepo(null).readProducts();

    expect(fetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/henrike-nel/prys-uil/main/data/products.json',
    );
    expect(file.products.map((p) => p.id)).toEqual(['a']);
    expect(sha).toBeNull();
  });

  it('treats 404s as an empty list and a missing price file', async () => {
    stubFetch(new Response('Not Found', { status: 404 }));

    expect(await createRepo(null).readProducts()).toEqual({ file: productsFile(), sha: null });
    expect(await createRepo(null).readPriceFile('a')).toBeUndefined();
  });

  it('reports other HTTP errors', async () => {
    stubFetch(new Response('', { status: 500 }));

    await expect(createRepo(null).readProducts()).rejects.toThrow('HTTP 500');
  });

  it('reports a friendly error for a 200 response that is not valid JSON', async () => {
    stubFetch(new Response('<html>not json</html>', { status: 200 }));

    await expect(createRepo(null).readProducts()).rejects.toThrow('invalid response');
  });

  it('cannot write', async () => {
    await expect(createRepo(null).writeProducts(productsFile(), null, 'msg')).rejects.toThrow(
      'Settings',
    );
  });
});
