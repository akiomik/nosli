<script lang="ts">
  import { getContext } from 'svelte';
  import type { RxNostr } from 'rx-nostr';
  import type Note from '$lib/entities/Note';
  import { profileStore } from '$lib/stores/nostr';
  import NoteListItemProfile from '$lib/components/NoteListItemProfile.svelte';
  import ProfileLink from '$lib/components/ProfileLink.svelte';
  import { inlineImage } from '$lib/actions/inlineImage';
  import { linkify, makeLinkifyOpts } from '$lib/actions/linkify';
  import { linkTarget } from '$lib/stores/cookie';

  export let note: Note;

  const client: RxNostr = getContext('nostr-client');
  const profile = profileStore({ client, pubkey: note.pubkey });
  $: opts = makeLinkifyOpts($linkTarget);
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

    <p
      use:inlineImage={{
        className: 'my-4 w-full max-w-lg',
        attributes: { alt: 'Embed image', decoding: 'async', loading: 'lazy' }
      }}
      use:linkify={opts}
      class="text-ellipsis overflow-hidden line-clamp-8 mt-4"
    >
      {note.modifiedContent()}
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
