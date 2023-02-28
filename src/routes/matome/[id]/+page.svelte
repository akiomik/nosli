<script lang="ts">
  import { seckey } from '$lib/stores/cookie';
  import type { PageData } from './$types';
  import type NostrClient from '$lib/services/NostrClient';
  import type LongFormContent from '$lib/entities/LongFormContent';
  import type Note from '$lib/entities/Note';
  import type Profile from '$lib/entities/Profile';
  import NoteList from '$lib/components/NoteList.svelte';
  import ProfileLink from '$lib/components/ProfileLink.svelte';

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
  {#if $seckey !== ''}
    <a href="/matome/{data.matome.nip19Id()}/edit" class="btn bg-primary-500">Edit</a>
  {/if}

  <h1>{data.matome.title}</h1>
  {#if data.matome.summary}
    <p>{data.matome.summary}</p>
  {/if}
  <p>
    author:
    <ProfileLink profile={data.profile}>
      {data.profile.formattedName()}
    </ProfileLink>
  </p>

  <NoteList notes={data.notes} />
{/if}
