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
