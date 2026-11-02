<script lang="ts">
  import { createOctokit, owner, repo, testToken } from './lib/github';
  import { app, clearToken, errorMessage, setToken } from './lib/state.svelte';

  let { onclose }: { onclose: () => void } = $props();

  let dialog: HTMLDialogElement;
  let token = $state(app.token ?? '');
  let message = $state<string>();

  $effect(() => dialog.showModal());

  async function test() {
    message = 'Testing…';
    try {
      await testToken(createOctokit(token.trim()));
      message = 'Token works';
    } catch (e) {
      message = errorMessage(e);
    }
  }

  function save(event: SubmitEvent) {
    event.preventDefault();
    setToken(token.trim());
    dialog.close();
  }

  function clear() {
    clearToken();
    token = '';
    message = 'Token cleared';
  }
</script>

<dialog bind:this={dialog} {onclose}>
  <form onsubmit={save}>
    <h2>Settings</h2>
    <p>Repo: <strong>{owner}/{repo}</strong></p>
    <label>
      GitHub token
      <input type="password" bind:value={token} required autocomplete="off" />
    </label>
    <p class="hint">A fine-grained token for this repo only, with Contents: read and write.</p>
    {#if message}<p>{message}</p>{/if}
    <div class="actions">
      <button type="button" onclick={test} disabled={!token.trim()}>Test</button>
      <button type="button" onclick={clear}>Clear</button>
      <button type="button" onclick={() => dialog.close()}>Close</button>
      <button class="primary">Save</button>
    </div>
  </form>
</dialog>
