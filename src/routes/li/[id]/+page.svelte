<script lang="ts">
  import { getContext } from 'svelte';
  import { startWith } from 'rxjs';
  import type { nip19 } from 'nostr-tools';
  import type { RxNostr } from 'rx-nostr';
  import { _, date } from 'svelte-i18n';

  import type { PageData } from './$types';
  import LongFormContent from '#lib/entities/LongFormContent.js';
  import {
    matomeStore,
    matomeDeletionRequestsStore,
    profileStore,
    notesStore
  } from '#lib/stores/nostr.js';
  import { linkify, linkifyOpts } from '#lib/actions/linkify.js';
  import KeyManager from '#lib/services/KeyManager.js';
  import { loginMethod } from '#lib/stores/login.js';
  import { orMissing, retries, retryable, withEnd } from '#lib/stores/missing.js';
  import { focusWhen } from '#lib/actions/focusWhen.js';
  import MissingAlert from '#lib/components/MissingAlert.svelte';
  import NoteList from '#lib/components/NoteList.svelte';
  import ProfileLink from '#lib/components/ProfileLink.svelte';
  import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';
  import ProfileLine from '#lib/components/ProfileLine.svelte';
  import Alert from '#lib/components/Alert.svelte';

  export let data: PageData & {
    params: nip19.AddressPointer;
  };

  const client: RxNostr = getContext('nostr-client');
  // The list, or why there is none once the request has ended. It can be asked for again, since
  // the relays may only have been slow, and so are the author's profile and the deletion requests
  // for the address, which asked the same relays.
  const listRetries = retries(client);
  $: request = retryable(
    () =>
      matomeStore({
        client,
        pubkey: data.params.pubkey,
        identifier: data.params.identifier
      }).pipe(orMissing(client)),
    listRetries
  );
  $: matome = $request instanceof LongFormContent ? $request : undefined;
  $: missing = typeof $request === 'string' ? $request : undefined;
  // Another author's profile starts from none.
  $: profile = listRetries
    .again(() => profileStore({ client, pubkey: data.params.pubkey }))
    .pipe(startWith(undefined));
  // The list is shown until a deletion request from its author arrives. A request for its address
  // covers every version up to the request's date, so those are asked for once, along with the
  // list, while those for a version's ID are asked for as each version arrives.
  $: addressDeletions = listRetries.again(() =>
    matomeDeletionRequestsStore({
      client,
      author: data.params.pubkey,
      addresses: [LongFormContent.addressOf(data.params.pubkey, data.params.identifier)]
    })
  );
  $: versionDeletions = matome?.id
    ? matomeDeletionRequestsStore({ client, author: matome.pubkey, ids: [matome.id] })
    : undefined;
  $: deleted = matome?.isDeletedBy([...$addressDeletions, ...($versionDeletions ?? [])]);
  $: notes = matome
    ? retryable(
        () =>
          notesStore({ client, ids: matome.eventIds(), relays: matome.noteRelays() }).pipe(
            withEnd(client)
          ),
        retries(client)
      )
    : undefined;
  // Why some notes are missing, once their request has ended.
  $: notesMissing =
    $notes?.ended && $notes.value.some(({ note }) => !note) ? $notes.reason : undefined;
  // After a retry, what it found takes the focus from its button, which has left the page.
  let retried = false;
  const retry = () => {
    retried = true;
    request.retry();
  };
  let notesRetried = false;
  const retryNotes = () => {
    notesRetried = true;
    notes?.retry();
  };
  // A retry for the previous list, or for the notes of an older version, does not move the focus.
  $: if (request) retried = false;
  $: if (notes) notesRetried = false;
  // Checked again for each login, and when the author changes rather than for each version.
  $: author = matome?.pubkey;
  $: isMine = author && $loginMethod ? KeyManager.isLoggedInAs(author) : false;
  $: title =
    matome && $profile
      ? $_('list-title-with-author', {
          values: { title: matome.title, name: $profile.formattedName() }
        })
      : matome?.title;
</script>

<svelte:head>
  <!-- A title is always set, so that the previous page's title does not stay while the list loads. -->
  {#if matome && !deleted}
    <title>{title} | Nosli</title>
    <meta name="description" content={matome.summary} />
    <meta name="keywords" content="nostr,curated,list,damus,snort" />
    <meta property="og:url" content="https://nosli.vercel.app/li/{matome.nip19Id()}" />
    <meta property="og:title" content="{matome.title} | Nosli" />
    <meta property="og:description" content={matome.summary} />
  {:else}
    <title>Nosli</title>
  {/if}
</svelte:head>

<!-- A list that no relay has any more, but whose deletion request one has, was deleted. -->
{#if (matome && deleted) || (missing && $addressDeletions.length > 0)}
  <Alert variant="warning">
    <p>{$_('alert.list-deleted')}</p>
  </Alert>
{:else if matome}
  <div class="flex items-center justify-between space-x-2">
    <h1
      class="text-3xl md:text-5xl font-heading-token min-w-0 wrap-anywhere"
      tabindex="-1"
      use:focusWhen={retried}
    >
      {matome.title}
    </h1>

    {#await isMine}
      <!-- noop -->
    {:then isMine}
      {#if isMine && $loginMethod !== 'npub'}
        <div>
          <a href="/li/{matome.nip19Id()}/edit" class="btn bg-primary-500">{$_('edit')}</a>
        </div>
      {/if}
    {:catch}
      <!-- Without the public key from the NIP-07 extension, the list is shown as someone else's. -->
    {/await}
  </div>

  {#if matome.summary}
    <p class="wrap-anywhere" use:linkify={linkifyOpts}>{matome.summary}</p>
  {/if}

  <div class="flex flex-col space-y-2">
    {#if $profile}
      <div class="flex flex-row items-center space-x-2">
        <p>{$_('by-author')}</p>
        <ProfileLink profile={$profile} local={true} class="anchor">
          <ProfileLine profile={$profile} />
        </ProfileLink>
      </div>
    {/if}

    <p>
      {$_('last-updated')}
      {$date(matome.createdAt, { dateStyle: 'medium', timeStyle: 'medium' })}
    </p>
  </div>

  {#if $notes}
    {#if notesMissing}
      <MissingAlert
        missing={notesMissing}
        notFound={$_('missing.notes')}
        focus={notesRetried}
        on:retry={retryNotes}
      />
    {/if}
    <NoteList
      notes={$notes.value}
      loading={!$notes.ended}
      focus={notesRetried && $notes.ended && !notesMissing}
    />
  {:else}
    <LoadingSpinner />
  {/if}
{:else if missing}
  <MissingAlert {missing} notFound={$_('missing.list')} focus={retried} on:retry={retry} />
{:else}
  <LoadingSpinner />
{/if}
