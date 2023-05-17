<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import type Note from '$lib/entities/Note';
  import Profile from '$lib/entities/Profile';
  import { NoteContentFormatter } from '$lib/services/NoteContentFormatter';
  import NoteListItemProfile from '$lib/components/NoteListItemProfile.svelte';
  import ProfileLink from '$lib/components/ProfileLink.svelte';
  import type RxNostrClient from '$lib/services/RxNostrClient';

  export let note: Note;
  export let client: RxNostrClient;

  let profile: Profile | undefined = undefined;

  onMount(() => {
    if (browser) {
      client.observableProfile({ pubkey: note.pubkey }).subscribe((envelope) => {
        profile = Profile.fromEvent(envelope.event);
      });
    }
  });
</script>

<div class="card">
  <div class="p-4">
    {#if profile?.id}
      <ProfileLink {profile} class="unstyled">
        <NoteListItemProfile {profile} />
      </ProfileLink>
    {:else}
      <NoteListItemProfile {profile} />
    {/if}

    <p class="text-ellipsis overflow-hidden line-clamp-8 mt-4">
      {@html NoteContentFormatter.format(note.modifiedContent())}
    </p>
  </div>

  <hr />

  <footer class="card-footer flex items-center justify-end p-4">
    <p>
      {Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'medium' }).format(
        note.createdAt
      )}
    </p>
    <slot name="footer" />
  </footer>
</div>
