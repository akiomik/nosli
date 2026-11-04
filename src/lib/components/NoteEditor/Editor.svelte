<script lang="ts">
  import { nip19 } from 'nostr-tools';
  import { _ } from 'svelte-i18n';

  import NoteListItem from '$lib/components/NoteListItem.svelte';
  import NoteActions from '$lib/components/NoteEditor/NoteActions.svelte';
  import { decodeNoteId } from '$lib/services/NostrClient';
  import type { NoteEditorStore } from '$lib/stores/noteEditor';

  export let editor: NoteEditorStore;

  let newNoteId = '';

  $: newNoteHex = (() => {
    try {
      return decodeNoteId(newNoteId.trim()).id;
    } catch {
      return undefined;
    }
  })();
  $: isNewNoteListed =
    newNoteHex !== undefined &&
    ($editor.notes.some(({ id }) => id === newNoteHex) || $editor.adding.includes(newNoteHex));
  $: canAddNewNote = newNoteHex !== undefined && !isNewNoteListed;
</script>

<div class="flex flex-col space-y-8">
  {#each $editor.notes as { id, note }, i (id)}
    {#if note}
      <NoteListItem {note}>
        <NoteActions
          slot="footer"
          {editor}
          noteId={id}
          isFirst={i === 0}
          isLast={i === $editor.notes.length - 1}
        />
      </NoteListItem>
    {:else}
      <div class="card">
        <div class="p-4">
          <p>{$_('alert.failed-to-get-note')}</p>
          <p>{nip19.noteEncode(id)}</p>
        </div>
        <footer class="border-t border-surface-300 p-4">
          <NoteActions
            {editor}
            noteId={id}
            isFirst={i === 0}
            isLast={i === $editor.notes.length - 1}
          />
        </footer>
      </div>
    {/if}
  {/each}
  {#each $editor.adding as id (id)}
    <div class="card p-4" role="status">
      <p>{$_('loading-note')}</p>
      <p>{nip19.noteEncode(id)}</p>
    </div>
  {/each}
</div>

<div class="mt-4 input-group grid-cols-[1fr_auto]">
  <input
    type="text"
    bind:value={newNoteId}
    class="ig-input"
    class:input-error={newNoteId.trim() && !canAddNewNote}
    aria-invalid={newNoteId.trim() !== '' && !canAddNewNote}
    aria-describedby={isNewNoteListed ? 'new-note-listed' : undefined}
    placeholder="note1.../nevent1..."
  />
  <button
    class="ig-btn preset-filled-surface-300-700 disabled:opacity-50 disabled:cursor-not-allowed"
    disabled={!canAddNewNote}
    on:click|preventDefault={() => {
      // The ID itself is added, so that the relays an nevent hints at are kept.
      if (newNoteHex) editor.appendNote(newNoteId.trim());
      newNoteId = '';
    }}
  >
    {$_('add-note')}
  </button>
</div>
{#if isNewNoteListed}
  <p id="new-note-listed" class="mt-2">{$_('alert.note-already-added')}</p>
{/if}

<div class="mt-4">
  {$_('reorder-notes')}

  <button
    type="button"
    class="btn bg-surface-300"
    disabled={$editor.notes === undefined || $editor.notes.length === 0}
    on:click|preventDefault={editor.sortByLeaastRecentlyCreated}
  >
    {$_('reorder-by-least-recently-created')}
  </button>
</div>
