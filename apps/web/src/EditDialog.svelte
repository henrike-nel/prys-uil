<script lang="ts">
  import type { Product } from '@prysuil/shared';
  import { untrack } from 'svelte';
  import { displayName } from './lib/format';
  import { formFrom, toProduct, urlError } from './lib/product';
  import { app, deleteProduct, editProduct, errorMessage } from './lib/state.svelte';

  let { product, onclose }: { product: Product; onclose: () => void } = $props();

  let dialog: HTMLDialogElement;
  // The dialog is mounted fresh for each edit, so copying the product once is enough.
  let form = $state(untrack(() => formFrom(product)));
  let error = $state<string>();
  let saving = $state(false);

  $effect(() => dialog.showModal());

  async function run(action: () => Promise<void>) {
    saving = true;
    try {
      await action();
      dialog.close();
    } catch (e) {
      error = errorMessage(e);
    } finally {
      saving = false;
    }
  }

  function save(event: SubmitEvent) {
    event.preventDefault();
    error = urlError(form.url, app.products, product.id);
    if (!error) void run(() => editProduct(toProduct(form, product)));
  }

  function remove() {
    if (confirm(`Delete ${displayName(product, app.priceFiles[product.id])}?`)) {
      void run(() => deleteProduct(product));
    }
  }
</script>

<dialog bind:this={dialog} {onclose}>
  <form onsubmit={save}>
    <h2>Edit product</h2>
    <label>Link <input bind:value={form.url} required inputmode="url" autocomplete="off" /></label>
    <label>
      Name
      <input bind:value={form.name} placeholder="Uses the shop's title when empty" />
    </label>
    <label>
      Target price (R)
      <input type="number" bind:value={form.targetPrice} min="0.01" step="0.01" />
    </label>
    <label>
      Minimum drop %
      <input type="number" bind:value={form.minDropPercent} min="0" max="100" required />
    </label>
    <label>CSS selector <input bind:value={form.selector} autocomplete="off" /></label>
    <label class="check">
      <input type="checkbox" bind:checked={form.useBrowser} /> Use browser
    </label>
    <label class="check"><input type="checkbox" bind:checked={form.bought} /> Mark as bought</label>
    {#if error}<p class="error">{error}</p>{/if}
    <div class="actions">
      <button type="button" class="delete" onclick={remove} disabled={saving}>Delete</button>
      <button type="button" onclick={() => dialog.close()}>Cancel</button>
      <button class="primary" disabled={saving}>Save</button>
    </div>
  </form>
</dialog>

<style>
  .delete {
    margin-right: auto;
  }
</style>
