<script lang="ts">
  import { changeSinceAdded, currentPrice, lowestPrice } from '@prysuil/shared';
  import type { PriceFile, Product } from '@prysuil/shared';
  import { displayName, formatChange, formatPrice } from './lib/format';
  import { badge, badgeLabels } from './lib/list';
  import { webUrl } from './lib/product';
  import Sparkline from './Sparkline.svelte';

  let {
    product,
    priceFile,
    onedit,
  }: { product: Product; priceFile?: PriceFile; onedit?: () => void } = $props();

  const status = $derived(badge(product, priceFile));
  const href = $derived(webUrl(product.url));
</script>

<article>
  {#if priceFile?.imageUrl}
    <img src={priceFile.imageUrl} alt="" referrerpolicy="no-referrer" />
  {/if}
  <div class="body">
    <h2>{displayName(product, priceFile)}</h2>
    <p class="shop">
      {#if href}
        <a {href} target="_blank" rel="noopener noreferrer">{product.shop}</a>
      {:else}
        {product.shop}
      {/if}
    </p>
    {#if status}
      <span class="badge {status}">{badgeLabels[status]}</span>
    {/if}
    <dl>
      <div>
        <dt>Now</dt>
        <dd>{formatPrice(priceFile && currentPrice(priceFile))}</dd>
      </div>
      <div>
        <dt>Target</dt>
        <dd>{formatPrice(product.targetPrice)}</dd>
      </div>
      <div>
        <dt>Lowest</dt>
        <dd>{formatPrice(priceFile && lowestPrice(priceFile))}</dd>
      </div>
      <div>
        <dt>Change</dt>
        <dd>{formatChange(priceFile && changeSinceAdded(priceFile))}</dd>
      </div>
    </dl>
    {#if priceFile}
      <Sparkline history={priceFile.history} />
    {/if}
    {#if onedit}
      <button type="button" onclick={onedit}>Edit</button>
    {/if}
  </div>
</article>

<style>
  article {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.75rem;
  }

  img {
    width: 5rem;
    height: 5rem;
    object-fit: contain;
    flex-shrink: 0;
  }

  .body {
    flex: 1;
    min-width: 0;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
    overflow-wrap: anywhere;
  }

  .shop {
    margin: 0.15rem 0 0.5rem;
    color: var(--color-text-muted);
  }

  .shop a {
    color: inherit;
  }

  .badge {
    display: inline-block;
    padding: 0.1rem 0.6rem;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 600;
    background: var(--color-border);
  }

  .badge.below-target {
    background: var(--color-green);
  }

  .badge.dropped {
    background: var(--color-orange);
  }

  .badge.checking {
    background: transparent;
    border: 1px solid var(--color-border);
  }

  dl {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1.25rem;
    margin: 0.75rem 0;
  }

  dt {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  dd {
    margin: 0;
  }

  button {
    margin-top: 0.5rem;
  }
</style>
