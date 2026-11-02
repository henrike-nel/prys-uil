const trackingParams = ['gclid', 'fbclid', 'msclkid', 'mc_cid', 'mc_eid'];

export function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  for (const key of [...parsed.searchParams.keys()]) {
    if (key.startsWith('utm_') || trackingParams.includes(key)) {
      parsed.searchParams.delete(key);
    }
  }
  parsed.search = parsed.searchParams.toString();
  parsed.hash = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  return parsed.toString();
}
