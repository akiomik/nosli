<script lang="ts">
  import { nip19 } from 'nostr-tools';
  import { _ } from 'svelte-i18n';

  import NoteListItem from '$lib/components/NoteListItem.svelte';
  import type { NoteEditorStore } from '$lib/stores/noteEditor';
  import Alert from '$lib/components/Alert.svelte';

  export let editor: NoteEditorStore;

  const toggle = (noteId: string | undefined): void => {
    if (!noteId) {
      return;
    }

    if (isUsed(noteId)) {
      editor.removeNote(noteId);
    } else {
      editor.appendNote(noteId);
    }
  };

  const isUsed = (noteId: string | undefined): boolean =>
    !!$editor.notes.find((note) => note.id === noteId);
</script>

<div class="flex flex-col space-y-8">
  {#each $editor.searchedNotes as { id, note } (id)}
    {#if note}
      <NoteListItem {note}>
        <div slot="footer">
          <button
            type="button"
            class="btn ml-5"
            class:variant-soft-surface={isUsed(id)}
            class:variant-soft-primary={!isUsed(id)}
            on:click={() => toggle(id)}>{isUsed(id) ? $_('remove') : $_('add')}</button
          >
        </div>
      </NoteListItem>
    {:else}
      <Alert variant="warning">
        <p>{$_('alert.failed-to-get-note')}</p>
        <p>{nip19.noteEncode(id)}</p>
      </Alert>
    {/if}
  {/each}
</div>
