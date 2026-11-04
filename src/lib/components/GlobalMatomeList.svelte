<script lang="ts">
  import { getContext } from 'svelte';
  import type { RxNostr } from 'rx-nostr';
  import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';
  import MatomeList from '#lib/components/MatomeList.svelte';
  import { retries, retryable, withEnd } from '#lib/stores/missing.js';
  import { recentGlobalMatomesStore } from '#lib/stores/nostr.js';

  const client: RxNostr = getContext('nostr-client');
  const matomes = retryable(
    () => recentGlobalMatomesStore({ client, limit: 25 }).pipe(withEnd(client)),
    retries(client)
  );
  // Why there are none, once the request has ended.
  $: missing = $matomes?.ended && $matomes.value.length === 0 ? $matomes.reason : undefined;
  let retried = false;
  const retry = () => {
    retried = true;
    matomes.retry();
  };
</script>

{#if $matomes === undefined || (!$matomes.ended && $matomes.value.length === 0)}
  <LoadingSpinner />
{:else}
  <MatomeList matomes={$matomes.value} {missing} focus={retried} on:retry={retry} />
{/if}
