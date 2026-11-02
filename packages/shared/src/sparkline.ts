import type { PricePoint } from './schemas';

const pad = 1; // keeps the stroke inside the box

// SVG path `d` for a price history, scaled to fit a width x height box.
export function sparklinePath(history: PricePoint[], width = 100, height = 24): string | undefined {
  if (history.length < 2) return undefined;
  const prices = history.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const stepX = (width - 2 * pad) / (prices.length - 1);
  const y = (price: number) =>
    max === min ? height / 2 : pad + ((max - price) / (max - min)) * (height - 2 * pad);
  const round = (n: number) => Math.round(n * 100) / 100;
  return prices
    .map((price, i) => `${i === 0 ? 'M' : 'L'} ${round(pad + i * stepX)} ${round(y(price))}`)
    .join(' ');
}
