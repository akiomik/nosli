<script lang="ts">
  import { getContext, onDestroy } from 'svelte';
  import type { nip19 } from 'nostr-tools';
  import type { RxNostr } from 'rx-nostr';
  import { _ } from 'svelte-i18n';

  import type { PageData } from './$types';
  import { focusWhen } from '#lib/actions/focusWhen.js';
  import { matomeStore } from '#lib/stores/nostr.js';
  import KeyManager, { Nip07CanceledError, Nip07MissingError } from '#lib/services/KeyManager.js';
  import { loginMethod } from '#lib/stores/login.js';
  import MatomeForm from '#lib/components/MatomeForm.svelte';
  import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';
  import Nip07Waiting from '#lib/components/Nip07Waiting.svelte';
  import Alert from '#lib/components/Alert.svelte';

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
  // Checked again for each login, and when the author changes rather than for each version. The
  // author can stop waiting for a NIP-07 extension and try again.
  $: author = $matome?.pubkey;
  let keyLookup = new AbortController();
  let retried = false;
  // A lookup for another author or login is not a retry.
  $: if (author && $loginMethod) {
    keyLookup = new AbortController();
    retried = false;
  }
  $: loggedInAs =
    author && $loginMethod ? KeyManager.isLoggedInAs(author, keyLookup.signal) : false;
  const retry = () => {
    retried = true;
    keyLookup = new AbortController();
  };
  // An extension that is still loading is then not asked.
  onDestroy(() => keyLookup.abort());
</script>

<svelte:head>
  <title>{$_('edit-identifier', { values: { identifier: data.params.identifier } })} | Nosli</title>
</svelte:head>

<!-- After a logout, the load answers with a 401. -->
{#if $matome && $loginMethod}
  {#await loggedInAs}
    <LoadingSpinner>
      {#if $loginMethod === 'nip07'}
        <Nip07Waiting centered focus={retried} on:cancel={() => keyLookup.abort()} />
      {/if}
    </LoadingSpinner>
  {:then loggedInAs}
    {#if loggedInAs}
      <!-- Takes the focus from the Cancel button of a retry, which has left the page. -->
      <h1
        class="text-3xl md:text-5xl font-heading-token wrap-anywhere"
        tabindex="-1"
        use:focusWhen={retried}
      >
        {$_('edit-identifier', { values: { identifier: $matome.identifier } })}
      </h1>

      {#if $matome.hasContentBesidesNotes()}
        <!-- Shown when editing starts, and again by the save button, so that the author can decide
             before doing any work. -->
        <Alert variant="warning">
          <p>{$_('alert.content-replaced-on-edit')}</p>
          <details class="mt-2">
            <summary class="cursor-pointer">{$_('show-current-content')}</summary>
            <p class="mt-2 whitespace-pre-wrap wrap-anywhere">{$matome.content}</p>
          </details>
        </Alert>
      {/if}

      <MatomeForm matome={$matome} />
    {:else}
      <Alert variant="error">
        <p>{$_('error.unauthorized')}</p>
      </Alert>
    {/if}
  {:catch error}
    {#if error instanceof Nip07MissingError}
      <!-- The layout logs out a NIP-07 login without its extension. -->
      <LoadingSpinner />
    {:else if error instanceof Nip07CanceledError}
      <div role="alert">
        <Alert variant="warning">
          <p>{$_('alert.nip07-canceled')}</p>
          <button
            type="button"
            class="btn preset-filled-surface-200-800 mt-2"
            use:focusWhen={true}
            on:click={retry}
          >
            {$_('retry')}
          </button>
        </Alert>
      </div>
    {:else}
      <Alert variant="error">
        <p>{$_('alert.failed-to-get-public-key-for-edit')}</p>
      </Alert>
    {/if}
  {/await}
{:else}
  <LoadingSpinner />
{/if}
