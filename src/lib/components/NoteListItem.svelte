<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import type { RxNostr } from 'rx-nostr';
  import { _ } from 'svelte-i18n';
  import type Note from '$lib/entities/Note';
  import { profileStore } from '$lib/stores/nostr';
  import NoteListItemProfile from '$lib/components/NoteListItemProfile.svelte';
  import ProfileLink from '$lib/components/ProfileLink.svelte';
  import { inlineImage } from '$lib/actions/inlineImage';
  import { linkify, linkifyOpts } from '$lib/actions/linkify';

  export let note: Note;

  const client: RxNostr = getContext('nostr-client');
  const profile = profileStore({ client, pubkey: note.pubkey });

  let content: HTMLParagraphElement;
  let expanded = false;
  let clamped = false;

  // Images load after mount and resizing rewraps the text, so measure again after either.
  const measure = () => {
    if (!expanded) clamped = content.scrollHeight > content.clientHeight;
  };

  onMount(() => {
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    content.addEventListener('load', measure, true);
    return () => {
      observer.disconnect();
      content.removeEventListener('load', measure, true);
    };
  });
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
      bind:this={content}
      use:inlineImage={{
        className: 'my-4 w-full max-w-lg',
        attributes: { alt: 'Embed image', decoding: 'async', loading: 'lazy' }
      }}
      use:linkify={linkifyOpts}
      class="text-ellipsis overflow-hidden mt-4"
      class:line-clamp-8={!expanded}
    >
      {note.modifiedContent()}
    </p>
    {#if clamped}
      <button
        type="button"
        class="anchor mt-2"
        aria-expanded={expanded}
        on:click={() => (expanded = !expanded)}
      >
        {expanded ? $_('show-less') : $_('show-more')}
      </button>
    {/if}
  </div>

  <hr />

  <footer class="flex items-center justify-end border-t border-surface-300 p-4">
    <p>
      {Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'medium' }).format(
        note.createdAt
      )}
    </p>
    <slot name="footer" />
  </footer>
</div>
