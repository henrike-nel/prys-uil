export const TIMEOUT_MS = 20_000;
const HOST_GAP_MS = 2000;

const headers = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  'Accept-Language': 'en-ZA,en',
};

export async function fetchHtml(url: string): Promise<string> {
  const get = () => fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  let response = await get().catch(() => undefined);
  if (!response || response.status >= 500) {
    // The retry goes to the same host, so it waits the same gap as the throttle.
    await sleep(HOST_GAP_MS);
    response = await get();
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

export type Throttle = <T>(url: string, task: () => Promise<T>) => Promise<T>;

// At most `concurrency` tasks at once, and at least `gapMs` between the starts
// of tasks for the same host.
export function createThrottle(concurrency = 3, gapMs = HOST_GAP_MS): Throttle {
  let active = 0;
  const waiting: (() => void)[] = [];
  const nextStart = new Map<string, number>();

  return async (url, task) => {
    if (active < concurrency) active++;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      const host = new URL(url).hostname;
      const start = Math.max(Date.now(), nextStart.get(host) ?? 0);
      nextStart.set(host, start + gapMs);
      if (start > Date.now()) await sleep(start - Date.now());
      return await task();
    } finally {
      // Hand the slot straight to the next task so nothing can jump the queue.
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
