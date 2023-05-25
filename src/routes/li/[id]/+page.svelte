<script lang="ts">
  import { getContext } from 'svelte';
  import type { AddressPointer } from 'nostr-tools/nip19';
  import type { RxNostr } from 'rx-nostr';

  import type { PageData } from './$types';
  import { matomeStore, profileStore, notesStore } from '$lib/stores/nostr';
  import { linkify, linkifyOpts } from '$lib/actions/linkify';
  import KeyManager from '$lib/services/KeyManager';
  import NoteList from '$lib/components/NoteList.svelte';
  import ProfileLink from '$lib/components/ProfileLink.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import ProfileLine from '$lib/components/ProfileLine.svelte';

  export let data: PageData & {
    params: AddressPointer;
  };

  const client: RxNostr = getContext('nostr-client');
  $: matome = matomeStore({
    client,
    pubkey: data.params.pubkey,
    identifier: data.params.identifier
  });
  $: profile = profileStore({ client, pubkey: data.params.pubkey });
  $: notes = $matome ? notesStore({ client, ids: $matome.eventIds() }) : undefined;
</script>

<svelte:head>
  {#if $matome && $profile}
    <title>{$matome.title} by {$profile.formattedName()} | Nosli</title>
    <meta name="description" content={$matome.summary} />
    <meta name="keywords" content="nostr,curated,list,damus,snort" />
    <meta property="og:url" content="https://nosli.vercel.app/li/{$matome.nip19Id()}" />
    <meta property="og:title" content="{$matome.title} | Nosli" />
    <meta property="og:description" content={$matome.summary} />
  {/if}
</svelte:head>

{#if $matome}
  <div class="flex items-center justify-between space-x-2">
    <h1>{$matome.title}</h1>

    {#await KeyManager.isLoggedInAs($matome.pubkey)}
      <!-- noop -->
    {:then isMine}
      {#if isMine && KeyManager.isWritableLoggedIn()}
        <div>
          <a href="/li/{$matome.nip19Id()}/edit" class="btn bg-primary-500">Edit</a>
        </div>
      {/if}
    {/await}
  </div>

  {#if $matome.summary}
    <p use:linkify={linkifyOpts}>{$matome.summary}</p>
  {/if}

  <div class="flex flex-col space-y-2">
    {#if $profile}
      <div class="flex flex-row items-center space-x-2">
        <p>By</p>
        <ProfileLink profile={$profile} local={true}>
          <ProfileLine profile={$profile} />
        </ProfileLink>
      </div>
    {/if}

    <p>
      Last updated:
      {Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'medium' }).format(
        $matome.createdAt
      )}
    </p>
  </div>

  {#if $notes}
    <NoteList notes={$notes} />
  {:else}
    <LoadingSpinner />
  {/if}
{:else}
  <LoadingSpinner />
{/if}
