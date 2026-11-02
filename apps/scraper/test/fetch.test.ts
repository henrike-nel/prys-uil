import { afterEach, describe, expect, it, vi } from 'vitest';
import { createThrottle, fetchHtml } from '../src/fetch';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function stubFetch(...responses: (Response | Error)[]) {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => {
    const next = responses.shift();
    if (!next || next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('fetchHtml', () => {
  it('returns the body and sends browser-like headers', async () => {
    const fetchMock = stubFetch(new Response('<html></html>'));

    await expect(fetchHtml('https://shop.example/item')).resolves.toBe('<html></html>');
    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['User-Agent']).toContain('Chrome');
    expect(headers['Accept-Language']).toBe('en-ZA,en');
  });

  it('retries once on a 5xx, 2 s later', async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch(new Response('', { status: 503 }), new Response('ok'));

    const result = expect(fetchHtml('https://shop.example/item')).resolves.toBe('ok');
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries once on a network error', async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch(new TypeError('fetch failed'), new Response('ok'));

    const result = expect(fetchHtml('https://shop.example/item')).resolves.toBe('ok');
    await vi.advanceTimersByTimeAsync(2000);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after one retry', async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch(
      new Response('', { status: 502 }),
      new Response('', { status: 502 }),
    );

    const result = expect(fetchHtml('https://shop.example/item')).rejects.toThrow('HTTP 502');
    await vi.advanceTimersByTimeAsync(2000);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails with the status on a 4xx without retrying', async () => {
    const fetchMock = stubFetch(new Response('', { status: 403 }));

    await expect(fetchHtml('https://shop.example/item')).rejects.toThrow('HTTP 403');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('createThrottle', () => {
  it('waits at least 2 s between requests to the same host', async () => {
    vi.useFakeTimers();
    const throttle = createThrottle();
    const t0 = Date.now();
    const starts = new Map<string, number>();
    const task = (url: string) =>
      throttle(url, async () => {
        starts.set(url, Date.now() - t0);
      });

    const all = Promise.all([
      task('https://a.example/1'),
      task('https://a.example/2'),
      task('https://b.example/1'),
      task('https://a.example/3'),
    ]);
    await vi.runAllTimersAsync();
    await all;

    expect(starts.get('https://a.example/1')).toBe(0);
    expect(starts.get('https://a.example/2')).toBe(2000);
    expect(starts.get('https://a.example/3')).toBe(4000);
    expect(starts.get('https://b.example/1')).toBe(0);
  });

  it('runs at most 3 tasks at once', async () => {
    vi.useFakeTimers();
    const throttle = createThrottle();
    let running = 0;
    let max = 0;
    const task = async () => {
      running++;
      max = Math.max(max, running);
      await new Promise((resolve) => setTimeout(resolve, 100));
      running--;
    };

    const all = Promise.all(
      Array.from({ length: 7 }, (_, i) => throttle(`https://shop${i}.example/`, task)),
    );
    await vi.runAllTimersAsync();
    await all;

    expect(max).toBe(3);
  });

  it('frees the slot when a task fails', async () => {
    const throttle = createThrottle(1);

    await expect(
      throttle('https://a.example/', async () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    await expect(throttle('https://b.example/', async () => 'ok')).resolves.toBe('ok');
  });
});
