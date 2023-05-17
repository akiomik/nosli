<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import type { AddressPointer } from 'nostr-tools/nip19';
  import type { PageData } from './$types';
  import LongFormContent from '$lib/entities/LongFormContent';
  import type RxNostrClient from '$lib/services/RxNostrClient';
  import KeyManager from '$lib/services/KeyManager';
  import MatomeForm from '$lib/components/MatomeForm.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import Alert from '$lib/components/Alert.svelte';

  let matome: LongFormContent | undefined = undefined;

  export let data: PageData & {
    params: AddressPointer;
    client?: RxNostrClient;
  };

  onMount(() => {
    if (browser) {
      // TODO: Display "not found" on timeout
      data.client
        ?.observableMatome({ pubkey: data.params.pubkey, identifier: data.params.identifier })
        ?.subscribe((envelope0) => {
          matome = LongFormContent.fromEvent(envelope0.event);
        });
    }
  });
</script>

<svelte:head>
  {#if matome}
    <title>Edit {matome.identifier} | Nosli</title>
  {/if}
</svelte:head>

{#if matome}
  {#await KeyManager.isLoggedInAs(matome.pubkey)}
    <LoadingSpinner />
  {:then loggedInAs}
    {#if loggedInAs}
      <h1>Edit {matome.identifier}</h1>

      <MatomeForm rxClient={data.client} {matome} />
    {:else}
      <Alert variant="danger">
        <p>Unauthorized &#128581;</p>
      </Alert>
    {/if}
  {/await}
{:else}
  <LoadingSpinner />
{/if}
