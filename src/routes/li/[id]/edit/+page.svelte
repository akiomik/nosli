<script lang="ts">
  import { getContext } from 'svelte';
  import type { AddressPointer } from 'nostr-tools/nip19';
  import type { RxNostr } from 'rx-nostr';
  import { _ } from 'svelte-i18n';

  import type { PageData } from './$types';
  import { matomeStore } from '$lib/stores/nostr';
  import KeyManager from '$lib/services/KeyManager';
  import MatomeForm from '$lib/components/MatomeForm.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import Alert from '$lib/components/Alert.svelte';

  export let data: PageData & {
    params: AddressPointer;
  };

  // TODO: Display "not found" on timeout
  const client: RxNostr = getContext('nostr-client');
  $: matome = matomeStore({
    client,
    pubkey: data.params.pubkey,
    identifier: data.params.identifier
  });
</script>

<svelte:head>
  {#if $matome}
    <title>{$_('edit-identifier', { values: { identifier: $matome.identifier } })} | Nosli</title>
  {/if}
</svelte:head>

{#if $matome}
  {#await KeyManager.isLoggedInAs($matome.pubkey)}
    <LoadingSpinner />
  {:then loggedInAs}
    {#if loggedInAs}
      <h1>{$_('edit-identifier', { values: { identifier: $matome.identifier } })}</h1>

      <MatomeForm matome={$matome} />
    {:else}
      <Alert variant="error">
        <p>Unauthorized &#128581;</p>
      </Alert>
    {/if}
  {/await}
{:else}
  <LoadingSpinner />
{/if}
