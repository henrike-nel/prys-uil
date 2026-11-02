import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PriceFile, Product } from '@prysuil/shared';
import { CallMeBotNotifier } from '../src/notifiers/callmebot';
import type { Alert } from '../src/notifiers/types';

const fetchMock = vi.fn<(url: URL) => Promise<Response>>(
  async () => new Response('Message queued'),
);

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('CALLMEBOT_PHONE', '27820000000');
  vi.stubEnv('CALLMEBOT_APIKEY', 'secret-key');
});

afterEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response('Message queued'));
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function sentTexts(): (string | null)[] {
  return fetchMock.mock.calls.map(([url]) => new URL(url).searchParams.get('text'));
}

function drop(name: string, targetPrice?: number): Alert {
  const product = Product.parse({
    id: 'p1',
    url: 'https://shop.example/item',
    name,
    shop: 'shop.example',
    targetPrice,
    addedAt: '2026-10-01T00:00:00Z',
  });
  const priceFile = PriceFile.parse({
    productId: 'p1',
    history: [{ at: '2026-10-01T00:00:00Z', price: 6999 }],
    lastCheckedAt: '2026-10-02T00:00:00Z',
  });
  return { kind: 'price-drop', product, priceFile, oldPrice: 6999, newPrice: 5499 };
}

function cantRead(name: string): Alert {
  const { product, priceFile } = drop(name);
  priceFile.lastError = 'HTTP 403';
  return { kind: 'cant-read-price', product, priceFile };
}

describe('CallMeBotNotifier', () => {
  it('is enabled only when both secrets are set', () => {
    expect(new CallMeBotNotifier().enabled()).toBe(true);
    vi.stubEnv('CALLMEBOT_APIKEY', '');
    expect(new CallMeBotNotifier().enabled()).toBe(false);
    vi.stubEnv('CALLMEBOT_APIKEY', 'secret-key');
    vi.stubEnv('CALLMEBOT_PHONE', '');
    expect(new CallMeBotNotifier().enabled()).toBe(false);
  });

  it('sends one message per alert for up to 3 alerts', async () => {
    await new CallMeBotNotifier().send([drop('Sony WH-1000XM5', 5800), cantRead('Kettle')]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const url = new URL(fetchMock.mock.calls[0]![0]);
    expect(url.origin + url.pathname).toBe('https://api.callmebot.com/whatsapp.php');
    expect(url.searchParams.get('phone')).toBe('27820000000');
    expect(url.searchParams.get('apikey')).toBe('secret-key');
    expect(sentTexts()).toEqual([
      'PrysUil: Sony WH-1000XM5 dropped to R5 499 (was R6 999, -21%). Target R5 800.\nhttps://shop.example/item',
      `PrysUil: can't read the price for Kettle (HTTP 403). Set a CSS selector or enable "use browser".\nhttps://shop.example/item`,
    ]);
  });

  it('leaves out the target when there is none', async () => {
    await new CallMeBotNotifier().send([drop('Kettle')]);

    expect(sentTexts()[0]).toBe(
      'PrysUil: Kettle dropped to R5 499 (was R6 999, -21%).\nhttps://shop.example/item',
    );
  });

  it('sends a single summary for more than 3 alerts', async () => {
    await new CallMeBotNotifier().send([drop('A'), drop('B'), drop('C'), cantRead('D')]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentTexts()[0]).toBe(
      [
        'PrysUil: 4 alerts',
        'A: R5 499 (was R6 999)',
        'B: R5 499 (was R6 999)',
        'C: R5 499 (was R6 999)',
        "D: can't read price (HTTP 403)",
      ].join('\n'),
    );
  });

  it('throws on a non-2xx response without leaking secrets', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 500 }));

    const error = await new CallMeBotNotifier().send([drop('A')]).catch((error: Error) => error);

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain('secret-key');
    expect(String(error)).not.toContain('27820000000');
  });

  it('throws when the body reports an error', async () => {
    fetchMock.mockResolvedValue(new Response('APIKey secret-key is invalid'));

    const error = await new CallMeBotNotifier().send([drop('A')]).catch((error: Error) => error);

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain('secret-key');
  });

  it('throws on a network error without leaking the URL', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const error = await new CallMeBotNotifier().send([drop('A')]).catch((error: Error) => error);

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain('callmebot.com');
  });
});
