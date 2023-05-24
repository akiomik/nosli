<script lang="ts">
  import { getContext } from 'svelte';
  import type RxNostr from 'rx-nostr';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import MatomeList from '$lib/components/MatomeList.svelte';
  import { recentGlobalMatomesStore } from '$lib/stores/nostr';

  const client: RxNostr = getContext('nostr-client');
  const matomes = recentGlobalMatomesStore({ client, limit: 25 });
</script>

{#if $matomes === undefined}
  <LoadingSpinner />
{:else}
  <MatomeList matomes={$matomes} />
{/if}
