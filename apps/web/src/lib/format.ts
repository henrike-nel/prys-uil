import { formatPercent } from '@prysuil/shared';

export { displayName } from '@prysuil/shared';

const zar = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });

export function formatPrice(price: number | undefined): string {
  return price === undefined ? '–' : zar.format(price);
}

export const formatChange = formatPercent;
