<script lang="ts">
  import { getContext } from 'svelte';
  import type { RxNostr } from 'rx-nostr';
  import type Note from '$lib/entities/Note';
  import { profileStore } from '$lib/stores/nostr';
  import { NoteContentFormatter } from '$lib/services/NoteContentFormatter';
  import NoteListItemProfile from '$lib/components/NoteListItemProfile.svelte';
  import ProfileLink from '$lib/components/ProfileLink.svelte';

  export let note: Note;

  const client: RxNostr = getContext('nostr-client');
  const profile = profileStore({ client, pubkey: note.pubkey });
</script>

<div class="card">
  <div class="p-4">
    {#if $profile?.id}
      <ProfileLink profile={$profile} class="unstyled">
        <NoteListItemProfile profile={$profile} />
      </ProfileLink>
    {:else}
      <NoteListItemProfile profile={$profile} />
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
