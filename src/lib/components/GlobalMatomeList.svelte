<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import LongFormContent from '$lib/entities/LongFormContent';
  import Profile from '$lib/entities/Profile';
  import type RxNostrClient from '$lib/services/RxNostrClient';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import MatomeList from '$lib/components/MatomeList.svelte';

  export let client: RxNostrClient; // TODO: use context or store

  let matomes: LongFormContent[] | undefined = undefined;
  const profilesByPubkey: Record<string, Profile> = {};

  onMount(() => {
    if (browser) {
      client.observableGlobalArticles({ limit: 25 }).subscribe((envelope) => {
        const matome = LongFormContent.fromEvent(envelope.event);
        console.log('matome', matome);
        if (matomes === undefined) {
          matomes = [];
        }
        matomes = [...matomes, matome];

        if (profilesByPubkey[matome.pubkey] === undefined) {
          // TODO: use cache via repository
          client.observableProfile({ pubkey: matome.pubkey }).subscribe((envelope) => {
            const profile = Profile.fromEvent(envelope.event);
            // console.log('profile', profile);
            profilesByPubkey[matome.pubkey] = profile;
          });
        }
      });
    }
  });
</script>

{#if matomes === undefined}
  <LoadingSpinner />
{:else}
  <MatomeList {matomes} {profilesByPubkey} />
{/if}
