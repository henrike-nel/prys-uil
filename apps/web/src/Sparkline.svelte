<script lang="ts">
  import { sparklinePath, type PricePoint } from '@prysuil/shared';

  let { history }: { history: PricePoint[] } = $props();

  const d = $derived(sparklinePath(history));
</script>

{#if d}
  <svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
    <path
      {d}
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      vector-effect="non-scaling-stroke"
    />
  </svg>
{/if}

<style>
  svg {
    display: block;
    width: 100%;
    height: 2rem;
  }
</style>
