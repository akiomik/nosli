<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import type { RxNostr } from 'rx-nostr';
  import { _, date } from 'svelte-i18n';
  import type Note from '#lib/entities/Note.js';
  import { profileStore } from '#lib/stores/nostr.js';
  import NoteListItemProfile from '#lib/components/NoteListItemProfile.svelte';
  import ProfileLink from '#lib/components/ProfileLink.svelte';
  import { inlineImage } from '#lib/actions/inlineImage.js';
  import { linkify, linkifyOpts } from '#lib/actions/linkify.js';

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
      class="text-ellipsis overflow-hidden mt-4 wrap-anywhere"
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

  <!-- On a narrow screen, the editor's buttons move below the date instead of pushing it out. -->
  <footer
    class="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 border-t border-surface-300 p-4"
  >
    <p>
      {$date(note.createdAt, { dateStyle: 'medium', timeStyle: 'medium' })}
    </p>
    <slot name="footer" />
  </footer>
</div>
