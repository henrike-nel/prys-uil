export type PriceResult = { price: number } | { error: string };

const foreignCurrencies: [RegExp, string][] = [
  [/\$|\bUSD\b/i, 'USD'],
  [/€|\bEUR\b/i, 'EUR'],
  [/£|\bGBP\b/i, 'GBP'],
];

const noPrice = () => ({ error: 'no price found' });

// Spaces (including NBSP and narrow NBSP) are thousands separators. If both
// "," and "." appear, the last one is the decimal separator. If only one kind
// appears, it is a decimal separator when followed by 1-2 trailing digits,
// otherwise a thousands separator: "1,299" -> 1299, "1299,50" -> 1299.5.
export function parsePrice(raw: string): PriceResult {
  for (const [pattern, code] of foreignCurrencies) {
    if (pattern.test(raw)) return { error: `currency ${code}` };
  }

  const match = /^(?:ZAR|R)?([\d\s.,]+?)(?:ZAR)?$/i.exec(raw.trim());
  const amount = match?.[1]?.replace(/\s/g, '') ?? '';
  if (!/^\d+([.,]\d+)*$/.test(amount)) return noPrice();

  const lastSeparator = Math.max(amount.lastIndexOf(','), amount.lastIndexOf('.'));
  const decimals = amount.length - lastSeparator - 1;
  const hasBoth = amount.includes(',') && amount.includes('.');
  let whole = amount;
  let fraction = '';
  if (lastSeparator >= 0 && (hasBoth || decimals <= 2)) {
    const separator = amount.charAt(lastSeparator);
    if (amount.indexOf(separator) !== lastSeparator) return noPrice();
    whole = amount.slice(0, lastSeparator);
    fraction = amount.slice(lastSeparator + 1);
  }

  const price = Number(`${whole.replace(/[.,]/g, '')}.${fraction}`);
  return Number.isFinite(price) && price > 0 ? { price } : noPrice();
}
