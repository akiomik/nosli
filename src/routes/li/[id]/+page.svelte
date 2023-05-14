<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import type { AddressPointer } from 'nostr-tools/nip19';
  import type { PageData } from './$types';
  import type RxNostrClient from '$lib/services/RxNostrClient';
  import LongFormContent from '$lib/entities/LongFormContent';
  import Note from '$lib/entities/Note';
  import Profile from '$lib/entities/Profile';
  import KeyManager from '$lib/services/KeyManager';
  import NoteList from '$lib/components/NoteList.svelte';
  import ProfileLink from '$lib/components/ProfileLink.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import ProfileLine from '$lib/components/ProfileLine.svelte';

  let matome: LongFormContent | undefined = undefined;
  let profile: Profile | undefined = undefined;
  let notesById: Record<string, Note | undefined> | undefined = undefined;

  $: notes =
    matome?.eventIds()?.map((id) => {
      return notesById === undefined ? undefined : notesById[id];
    }) || [];

  export let data: PageData & {
    client?: RxNostrClient;
    params: AddressPointer;
  };

  onMount(() => {
    if (browser) {
      // TODO: Display "not found" on timeout
      data.client
        ?.observableMatome({ pubkey: data.params.pubkey, identifier: data.params.identifier })
        ?.subscribe((envelope0) => {
          matome = LongFormContent.fromEvent(envelope0.event);
          const ids = matome.eventIds();
          data.client?.observableNotes({ ids }).subscribe((envelope1) => {
            const note = Note.fromEvent(envelope1.event);

            if (notesById === undefined) {
              notesById = {};
            }

            notesById[envelope1.event.id] = note;
          });
        });

      data.client?.observableProfile({ pubkey: data.params.pubkey })?.subscribe((envelope) => {
        profile = Profile.fromEvent(envelope.event);
      });
    }
  });
</script>

<svelte:head>
  {#if matome && profile}
    <title>{matome.title} by {profile.formattedName()} | Nosli</title>
    <meta name="description" content={matome.summary} />
    <meta name="keywords" content="nostr,curated,list,damus,snort" />
    <meta property="og:url" content="https://nosli.vercel.app/li/{matome.nip19Id()}" />
    <meta property="og:title" content="{matome.title} | Nosli" />
    <meta property="og:description" content={matome.summary} />
  {/if}
</svelte:head>

{#if matome}
  <div class="flex items-center space-x-2">
    <h1 class="flex-none">{matome.title}</h1>

    {#if KeyManager.isLoggedInWithNip07() || KeyManager.isLoggedInWithSecretKey()}
      <div>
        <a href="/li/{matome.nip19Id()}/edit" class="btn bg-primary-500">Edit</a>
      </div>
    {/if}
  </div>

  {#if matome.summary}
    <p>{matome.summary}</p>
  {/if}

  <div class="flex flex-col space-y-2">
    {#if profile}
      <div class="flex flex-row items-center space-x-2">
        <p>By</p>
        <ProfileLink {profile} local={true}>
          <ProfileLine {profile} />
        </ProfileLink>
      </div>
    {/if}

    <p>
      Last updated:
      {Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'medium' }).format(
        matome.createdAt
      )}
    </p>
  </div>

  {#if notesById === undefined}
    <LoadingSpinner />
  {:else}
    <NoteList {notes} client={data.client} />
  {/if}
{:else}
  <LoadingSpinner />
{/if}
