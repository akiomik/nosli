<script lang="ts">
  import { onMount } from 'svelte';
  import type NostrClient from '$lib/services/NostrClient';
  import type LongFormContent from '$lib/entities/LongFormContent';
  import { pubkey } from '$lib/stores/cookie';

  export let client: NostrClient; // TODO: use context
  let asyncMatomes: Promise<LongFormContent[]> | undefined = undefined;

  onMount(async () => {
    await client.connect();
    asyncMatomes = client.listMatomes($pubkey);
  });
</script>

{#if asyncMatomes === undefined}
  loading...
{:else}
  {#await asyncMatomes}
    loading...
  {:then matomes}
    <ul>
      {#each matomes as matome}
        <li>
          <a href="/matome/{matome.nip19Id()}">{matome.title}</a>
        </li>
      {/each}
    </ul>
  {/await}
{/if}
