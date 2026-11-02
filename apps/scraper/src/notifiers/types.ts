import type { PriceFile, Product } from '@prysuil/shared';

export interface Alert {
  kind: 'price-drop' | 'cant-read-price';
  product: Product;
  priceFile: PriceFile;
  oldPrice?: number;
  newPrice?: number;
}

export interface Notifier {
  name: string;
  enabled(): boolean; // true when its secrets are set
  send(alerts: Alert[]): Promise<void>; // throws on failure
}
