<script lang="ts">
  import { onMount } from 'svelte';
  import type NostrClient from '$lib/services/NostrClient';
  import type LongFormContent from '$lib/entities/LongFormContent';
  import type Profile from '$lib/entities/Profile';
  import { pubkey } from '$lib/stores/cookie';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import MatomeListItem from '$lib/components/MatomeListItem.svelte';

  export let client: NostrClient; // TODO: use context
  let asyncMatomes: Promise<LongFormContent[]> | undefined = undefined;
  let asyncProfileByMatomeId: Record<string, Promise<Profile | undefined>> = {};

  onMount(async () => {
    await client.connect();
    asyncMatomes = client.listMatomes($pubkey);
    asyncMatomes.then((matomes: LongFormContent[]) => {
      matomes.forEach((matome: LongFormContent) => {
        const asyncProfile = client.getProfile(matome.pubkey);
        asyncProfileByMatomeId[matome.id] = asyncProfile;
      });
    });
  });
</script>

{#if asyncMatomes === undefined}
  <LoadingSpinner />
{:else}
  {#await asyncMatomes}
    <LoadingSpinner />
  {:then matomes}
    <div class="flex flex-col space-y-4">
      {#each matomes as matome}
        <a href="/matome/{matome.nip19Id()}" class="unstyled">
          <MatomeListItem {matome} asyncProfile={asyncProfileByMatomeId[matome.id]} />
        </a>
      {/each}
    </div>
  {/await}
{/if}
