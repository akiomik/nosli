<script lang="ts">
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import NoteListItem from '$lib/components/NoteListItem.svelte';
  import NoteActions from '$lib/components/NoteEditor/NoteActions.svelte';
  import type NostrClient from '$lib/services/NostrClient';
  import type { NoteEditorStore } from '$lib/stores/noteEditor';
  import { nip19 } from 'nostr-tools';

  export let editor: NoteEditorStore;
  export let client: NostrClient;

  let newNoteId = '';

  $: isNewNoteIdValid = (() => {
    if (!newNoteId.startsWith('note')) {
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
  {#each $editor.notes as { asyncNote, noteId }, idx (noteId)}
    {#await asyncNote}
      <LoadingSpinner size="sm" />
    {:then note}
      {#if note}
        <NoteListItem {note} {client}>
          <NoteActions
            slot="footer"
            {editor}
            {noteId}
            isFirst={idx === 0}
            isLast={idx === $editor.notes.length - 1}
          />
        </NoteListItem>
      {:else}
        <div class="card">
          <div class="p-4">
            <p>Failed to get a note.</p>
          </div>
          <footer class="card-footer p-4">
            <NoteActions
              {editor}
              {noteId}
              isFirst={idx === 0}
              isLast={idx === $editor.notes.length - 1}
            />
          </footer>
        </div>
      {/if}
    {/await}
  {/each}
</div>
<div class="mt-4 input-group input-group-divider grid-cols-[1fr_auto]">
  <input
    type="text"
    bind:value={newNoteId}
    class:input-error={newNoteId && !isNewNoteIdValid}
    placeholder="note1..."
  />
  <button
    class="variant-filled-secondary"
    disabled={!isNewNoteIdValid}
    on:click={() => {
      editor.appendNote(newNoteId);
      newNoteId = '';
    }}>Add Note</button
  >
</div>
