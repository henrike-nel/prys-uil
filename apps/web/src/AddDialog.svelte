<script lang="ts">
  import { nanoid } from 'nanoid';
  import { untrack } from 'svelte';
  import { emptyForm, toProduct, urlError } from './lib/product';
  import { addProduct, app, errorMessage } from './lib/state.svelte';

  let { url = '', onclose }: { url?: string; onclose: () => void } = $props();

  let dialog: HTMLDialogElement;
  let form = $state({ ...emptyForm(), url: untrack(() => url) });
  let error = $state<string>();
  let saving = $state(false);

  $effect(() => dialog.showModal());

  async function save(event: SubmitEvent) {
    event.preventDefault();
    error = urlError(form.url, app.products);
    if (error) return;
    saving = true;
    try {
      await addProduct(toProduct(form, { id: nanoid(), addedAt: new Date().toISOString() }));
      dialog.close();
    } catch (e) {
      error = errorMessage(e);
    } finally {
      saving = false;
    }
  }
</script>

<dialog bind:this={dialog} {onclose}>
  <form onsubmit={save}>
    <h2>Add product</h2>
    <label>Link <input bind:value={form.url} required inputmode="url" autocomplete="off" /></label>
    <label>
      Target price (R)
      <input type="number" bind:value={form.targetPrice} min="0.01" step="0.01" />
    </label>
    <label>
      Minimum drop %
      <input type="number" bind:value={form.minDropPercent} min="0" max="100" required />
    </label>
    {#if error}<p class="error">{error}</p>{/if}
    <div class="actions">
      <button type="button" onclick={() => dialog.close()}>Cancel</button>
      <button class="primary" disabled={saving}>Save</button>
    </div>
  </form>
</dialog>
