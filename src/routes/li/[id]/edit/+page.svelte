<script lang="ts">
  import { getContext, onDestroy } from 'svelte';
  import type { nip19 } from 'nostr-tools';
  import type { RxNostr } from 'rx-nostr';
  import { _ } from 'svelte-i18n';

  import type { PageData } from './$types';
  import { focusWhen } from '#lib/actions/focusWhen.js';
  import LongFormContent from '#lib/entities/LongFormContent.js';
  import { matomeStore, matomeDeletionRequestsStore } from '#lib/stores/nostr.js';
  import { orMissing, retries, retryable, withEnd } from '#lib/stores/missing.js';
  import KeyManager, { Nip07CanceledError, Nip07MissingError } from '#lib/services/KeyManager.js';
  import { loginMethod } from '#lib/stores/login.js';
  import MatomeForm from '#lib/components/MatomeForm.svelte';
  import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';
  import Nip07Waiting from '#lib/components/Nip07Waiting.svelte';
  import Alert from '#lib/components/Alert.svelte';
  import MissingAlert from '#lib/components/MissingAlert.svelte';

  export let data: PageData & {
    params: nip19.AddressPointer;
  };

  const client: RxNostr = getContext('nostr-client');
  // The list, or why there is none once the request has ended. It can be asked for again, since
  // the relays may only have been slow, and so are the deletion requests for its address. Its end
  // is marked too, since a newer version can still come until then.
  const listRetries = retries(client);
  $: request = retryable(
    () =>
      matomeStore({
        client,
        pubkey: data.params.pubkey,
        identifier: data.params.identifier
      }).pipe(orMissing(client), withEnd(client)),
    listRetries
  );
  $: matome = $request?.value instanceof LongFormContent ? $request.value : undefined;
  $: missing = typeof $request?.value === 'string' ? $request.value : undefined;
  // A list that its author deleted is shown as deleted, as on the list page, since saving it would
  // publish it again. The deletion requests are asked for in the same way, and saving waits for
  // them to end, so that one that comes late cannot be missed.
  $: addressDeletions = listRetries.again(() =>
    matomeDeletionRequestsStore({
      client,
      author: data.params.pubkey,
      addresses: [LongFormContent.addressOf(data.params.pubkey, data.params.identifier)]
    }).pipe(withEnd(client))
  );
  // Asked for once for each version, which the end of the list request gives again.
  $: versionId = matome?.id;
  $: versionDeletions =
    versionId && author
      ? matomeDeletionRequestsStore({ client, author, ids: [versionId] }).pipe(withEnd(client))
      : undefined;
  $: deleted = matome
    ? matome.isDeletedBy([...($addressDeletions?.value ?? []), ...($versionDeletions?.value ?? [])])
    : // A list that no relay has any more, but whose deletion request one has, was deleted.
      missing !== undefined && ($addressDeletions?.value.length ?? 0) > 0;
  $: checkingDeletion =
    !$request?.ended || !$addressDeletions?.ended || !($versionDeletions?.ended ?? true);
  // A notice that replaces the list takes the focus that was in it, which then leaves the page.
  let focusedInList = false;
  $: if (request) focusedInList = false;
  // After a retry, what it found takes the focus from its button, which has left the page.
  let requestRetried = false;
  const retryRequest = () => {
    requestRetried = true;
    request.retry();
  };
  // A retry for the previous list does not move the focus on this one.
  $: if (request) requestRetried = false;
  // Checked again for each login, and when the author changes rather than for each version. The
  // author can stop waiting for a NIP-07 extension and try again.
  $: author = matome?.pubkey;
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
  {#if deleted}
    <title>Nosli</title>
  {:else}
    <title
      >{$_('edit-identifier', { values: { identifier: data.params.identifier } })} | Nosli</title
    >
  {/if}
</svelte:head>

<!-- After a logout, the load answers with a 401. -->
{#if deleted && $loginMethod}
  <!-- It can replace the form, which then leaves the page. -->
  <div role="alert" tabindex="-1" use:focusWhen={focusedInList || requestRetried}>
    <Alert variant="warning">
      <p>{$_('alert.list-deleted')}</p>
    </Alert>
  </div>
{:else if matome && $loginMethod}
  <div class="space-y-8" on:focusin={() => (focusedInList = true)}>
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
          use:focusWhen={retried || requestRetried}
        >
          {$_('edit-identifier', { values: { identifier: matome.identifier } })}
        </h1>

        {#if matome.hasContentBesidesNotes()}
          <!-- Shown when editing starts, and again by the save button, so that the author can decide
               before doing any work. -->
          <Alert variant="warning">
            <p>{$_('alert.content-replaced-on-edit')}</p>
            <details class="mt-2">
              <summary class="cursor-pointer">{$_('show-current-content')}</summary>
              <p class="mt-2 whitespace-pre-wrap wrap-anywhere">{matome.content}</p>
            </details>
          </Alert>
        {/if}

        <MatomeForm {matome} {checkingDeletion} />
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
  </div>
{:else if missing && $loginMethod}
  <MissingAlert
    {missing}
    notFound={$_('missing.list')}
    focus={requestRetried}
    on:retry={retryRequest}
  />
{:else}
  <LoadingSpinner />
{/if}
