<script lang="ts">
  import type { Product } from '@prysuil/shared';
  import { untrack } from 'svelte';
  import AddDialog from './AddDialog.svelte';
  import lockup from './assets/prysuil-lockup.svg';
  import EditDialog from './EditDialog.svelte';
  import { visibleProducts } from './lib/list';
  import { sharedUrl } from './lib/share';
  import { app, load } from './lib/state.svelte';
  import ProductCard from './ProductCard.svelte';
  import SettingsDialog from './SettingsDialog.svelte';

  let hideBought = $state(true);
  // Opened from a share or the iOS Shortcut. Drop the query so a reload doesn't reopen it.
  let shared = $state(sharedUrl(location.search));
  let adding = $state(untrack(() => shared) !== undefined);
  let editing = $state<Product>();
  let settings = $state(false);

  if (location.search) history.replaceState(null, '', location.pathname);

  const products = $derived(visibleProducts(app.products, app.priceFiles, { hideBought }));

  void load();
</script>

<header>
  <img src={lockup} alt="PrysUil" />
  <button type="button" onclick={() => (settings = true)}>Settings</button>
</header>

<main>
  {#if !app.token}
    <p class="note">
      Read-only view. Add a GitHub token in
      <button type="button" class="link" onclick={() => (settings = true)}>Settings</button>
      to add and edit products.
    </p>
  {/if}

  <div class="toolbar">
    <label><input type="checkbox" bind:checked={hideBought} /> Hide bought</label>
    {#if app.token}
      <button type="button" class="primary" onclick={() => (adding = true)}>Add product</button>
    {/if}
  </div>

  {#if app.error}
    <p class="error">{app.error}</p>
  {/if}

  {#if products.length > 0}
    <ul>
      {#each products as product (product.id)}
        <li>
          <ProductCard
            {product}
            priceFile={app.priceFiles[product.id]}
            onedit={app.token ? () => (editing = product) : undefined}
          />
        </li>
      {/each}
    </ul>
  {:else if app.loading}
    <p>Loading…</p>
  {:else if app.products.length > 0}
    <p>No products match these filters.</p>
  {:else if !app.error}
    <p>Nothing here yet.</p>
  {/if}
</main>

{#if adding}
  <AddDialog
    url={shared}
    onclose={() => {
      adding = false;
      shared = undefined;
    }}
  />
{/if}
{#if editing}
  <EditDialog product={editing} onclose={() => (editing = undefined)} />
{/if}
{#if settings}
  <SettingsDialog onclose={() => (settings = false)} />
{/if}

<style>
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background: var(--color-green);
  }

  /* The lockup's green "prys" needs a light background to show on the green bar */
  header img {
    height: 2rem;
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    background: var(--color-cream);
  }

  main {
    max-width: 48rem;
    margin: 0 auto;
    padding: 1rem;
  }

  .note {
    padding: 0.75rem 1rem;
    border: 1px solid var(--color-border);
    border-radius: 0.75rem;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    text-decoration: underline;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1.25rem;
    margin-bottom: 1rem;
  }

  .toolbar .primary {
    margin-left: auto;
  }

  ul {
    display: grid;
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
