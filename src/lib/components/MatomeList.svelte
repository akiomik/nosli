<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import type LongFormContent from '$lib/entities/LongFormContent';
  import type Profile from '$lib/entities/Profile';
  import type NostrClient from '$lib/services/NostrClient';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import MatomeListItem from '$lib/components/MatomeListItem.svelte';
  import Alert from '$lib/components/Alert.svelte';

  export let matomes: LongFormContent[] | undefined = undefined;
  export let client: NostrClient; // TODO: use context

  let asyncProfileByMatomeId: Record<string, Promise<Profile | undefined>> = {};

  onMount(async () => {
    if (browser && matomes) {
      matomes.forEach((matome: LongFormContent) => {
        if (matome.id) {
          const asyncProfile = client.getProfile(matome.pubkey);
          asyncProfileByMatomeId[matome.id] = asyncProfile;
        }
      });
    }
  });
</script>

{#if matomes === undefined}
  <LoadingSpinner />
{:else if matomes.length === 0}
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
