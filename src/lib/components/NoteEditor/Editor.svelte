<script lang="ts">
  import { nip19 } from 'nostr-tools';
  import { _ } from 'svelte-i18n';

  import NoteListItem from '$lib/components/NoteListItem.svelte';
  import NoteActions from '$lib/components/NoteEditor/NoteActions.svelte';
  import type { NoteEditorStore } from '$lib/stores/noteEditor';

  export let editor: NoteEditorStore;

  let newNoteId = '';

  $: isNewNoteIdValid = (() => {
    if (!newNoteId.startsWith('note') && !newNoteId.startsWith('nevent')) {
      return false;
    }

    try {
      nip19.decode(newNoteId);
      return true;
    } catch {
      return false;
    }
  })();
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
        <footer class="card-footer p-4">
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
</div>

<div class="mt-4 input-group input-group-divider grid-cols-[1fr_auto]">
  <input
    type="text"
    bind:value={newNoteId}
    class:input-error={newNoteId && !isNewNoteIdValid}
    placeholder="note1.../nevent1..."
  />
  <button
    class="variant-filled-surface"
    disabled={!isNewNoteIdValid}
    on:click|preventDefault={() => {
      editor.appendNote(newNoteId);
      newNoteId = '';
    }}
  >
    {$_('add-note')}
  </button>
</div>

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
