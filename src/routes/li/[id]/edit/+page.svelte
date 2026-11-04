<script lang="ts">
  import { getContext } from 'svelte';
  import type { nip19 } from 'nostr-tools';
  import type { RxNostr } from 'rx-nostr';
  import { _ } from 'svelte-i18n';

  import type { PageData } from './$types';
  import { matomeStore } from '$lib/stores/nostr';
  import KeyManager from '$lib/services/KeyManager';
  import { loginMethod } from '$lib/stores/login';
  import MatomeForm from '$lib/components/MatomeForm.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import Alert from '$lib/components/Alert.svelte';

  export let data: PageData & {
    params: nip19.AddressPointer;
  };

  // TODO: Display "not found" on timeout
  const client: RxNostr = getContext('nostr-client');
  $: matome = matomeStore({
    client,
    pubkey: data.params.pubkey,
    identifier: data.params.identifier
  });
  // Checked again for each login, and when the author changes rather than for each version.
  $: author = $matome?.pubkey;
  $: loggedInAs = author && $loginMethod ? KeyManager.isLoggedInAs(author) : false;
</script>

<svelte:head>
  {#if $matome}
    <title>{$_('edit-identifier', { values: { identifier: $matome.identifier } })} | Nosli</title>
  {/if}
</svelte:head>

{#if $matome}
  {#await loggedInAs}
    <LoadingSpinner />
  {:then loggedInAs}
    {#if loggedInAs}
      <h1 class="text-3xl md:text-5xl font-heading-token">
        {$_('edit-identifier', { values: { identifier: $matome.identifier } })}
      </h1>

      <MatomeForm matome={$matome} />
    {:else}
      <Alert variant="error">
        <p>Unauthorized &#128581;</p>
      </Alert>
    {/if}
  {:catch}
    <Alert variant="error">
      <p>{$_('alert.failed-to-get-public-key-for-edit')}</p>
    </Alert>
  {/await}
{:else}
  <LoadingSpinner />
{/if}
