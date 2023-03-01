<script lang="ts">
  import { onMount } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import type NostrClient from '$lib/services/NostrClient';
  import type LongFormContent from '$lib/entities/LongFormContent';
  import type Profile from '$lib/entities/Profile';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import MatomeListItem from '$lib/components/MatomeListItem.svelte';
  import Alert from '$lib/components/Alert.svelte';

  export let id: string;
  export let client: NostrClient; // TODO: use context

  let asyncMatomes: Promise<LongFormContent[]> | undefined = undefined;
  let asyncProfileByMatomeId: Record<string, Promise<Profile | undefined>> = {};

  onMount(async () => {
    await client.connect();
    const pubkey = nip19.decode(id).data;
    if (typeof pubkey !== 'string') {
      throw new Error('Unexpected error: pubkey is not string');
    }

    asyncMatomes = client.listMatomes(pubkey);
    asyncMatomes.then((matomes: LongFormContent[]) => {
      matomes.forEach((matome: LongFormContent) => {
        if (matome.id) {
          const asyncProfile = client.getProfile(matome.pubkey);
          asyncProfileByMatomeId[matome.id] = asyncProfile;
        }
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
    {#if matomes.length === 0}
      <Alert variant="">
        <p>No matomes found.</p>
      </Alert>
    {:else}
      <div class="flex flex-col space-y-4">
        {#each matomes as matome}
          {#if matome.id}
            <a href="/li/{matome.nip19Id()}" class="unstyled">
              <MatomeListItem {matome} asyncProfile={asyncProfileByMatomeId[matome.id]} />
            </a>
          {/if}
        {/each}
      </div>
    {/if}
  {/await}
{/if}
