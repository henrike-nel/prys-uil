import type { PriceFile, Product } from '@prysuil/shared';

export type Alert =
  | {
      kind: 'price-drop';
      product: Product;
      priceFile: PriceFile;
      oldPrice: number;
      newPrice: number;
    }
  | { kind: 'cant-read-price'; product: Product; priceFile: PriceFile };

export interface SendOptions {
  mentionOwner?: boolean;
}

export interface Notifier {
  name: string;
  enabled(): boolean; // true when its secrets are set
  send(alerts: Alert[], options?: SendOptions): Promise<void>; // throws on failure
}
