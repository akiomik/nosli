<script lang="ts">
  import type Note from '$lib/entities/Note';
  import { NoteContentFormatter } from '$lib/services/NoteContentFormatter';
  import NoteListItemProfile from '$lib/components/NoteListItemProfile.svelte';
  import ProfileLink from '$lib/components/ProfileLink.svelte';
  import type NostrClient from '$lib/services/NostrClient';

  export let note: Note;
  export let client: NostrClient;

  note.asyncProfile = client.getProfile(note.pubkey);
</script>

<div class="card">
  <div class="p-4">
    {#await note.asyncProfile}
      <NoteListItemProfile profile={undefined} />
    {:then profile}
      {#if profile?.id}
        <ProfileLink {profile} class="unstyled">
          <NoteListItemProfile {profile} />
        </ProfileLink>
      {:else}
        <NoteListItemProfile {profile} />
      {/if}
    {/await}

    <p class="text-ellipsis overflow-hidden line-clamp-8 mt-4">
      {@html NoteContentFormatter.format(note.modifiedContent())}
    </p>
  </div>

  <hr />

  <footer class="card-footer flex justify-end p-4">
    <p>
      {Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'medium' }).format(
        note.createdAt
      )}
    </p>
  </footer>
</div>
