<script lang="ts">
  import { pubkey, seckey } from '$lib/stores/cookie';
  import type { PageData } from './$types';
  import type NostrClient from '$lib/services/NostrClient';
  import type LongFormContent from '$lib/entities/LongFormContent';
  import type Note from '$lib/entities/Note';
  import type Profile from '$lib/entities/Profile';
  import NoteList from '$lib/components/NoteList.svelte';
  import ProfileLink from '$lib/components/ProfileLink.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import ProfileLine from '$lib/components/ProfileLine.svelte';

  export let data: PageData & {
    matome: LongFormContent | undefined;
    profile: Profile | undefined;
    notes: Note[] | undefined;
    client: NostrClient | undefined;
  };
</script>

<svelte:head>
  {#if data.matome && data.notes && data.profile}
    <title>{data.matome.title} by {data.profile.formattedName()} | Nosli</title>
    <meta name="description" content={data.matome.summary} />
    <meta name="keywords" content="nostr,curated,list,damus,snort" />
    <meta property="og:url" content="https://nosli.vercel.app/matome/{data.matome.nip19Id()}" />
    <meta property="og:title" content="{data.matome.title} | Nosli" />
    <meta property="og:description" content={data.matome.summary} />
  {/if}
</svelte:head>

{#if data.matome && data.notes && data.profile}
  <div class="flex space-x-2">
    <h1>{data.matome.title}</h1>

    {#if $seckey !== '' && $pubkey === data.matome.pubkey}
      <a href="/li/{data.matome.nip19Id()}/edit" class="btn bg-primary-500">Edit</a>
    {/if}
  </div>

  {#if data.matome.summary}
    <p>{data.matome.summary}</p>
  {/if}

  <div class="flex flex-col space-y-2">
    <div class="flex flex-row items-center space-x-2">
      <p>By</p>
      <ProfileLink profile={data.profile}>
        <ProfileLine profile={data.profile} />
      </ProfileLink>
    </div>

    <p>
      Last updated:
      {Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'medium' }).format(
        data.matome.createdAt
      )}
    </p>
  </div>

  <NoteList notes={data.notes} />
{:else}
  <LoadingSpinner />
{/if}
