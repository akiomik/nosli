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
    !!$editor.notes.find((note) => note.id === noteId) ||
    (noteId !== undefined && $editor.adding.includes(noteId));
</script>

<div class="flex flex-col space-y-8">
  {#if $editor.searchFailed}
    <div role="alert">
      <Alert variant="warning">
        <p>{$_('alert.failed-to-get-public-key')}</p>
        <!-- Unlike disabled, aria-disabled keeps the focus on the button while the retry runs. -->
        <button
          type="button"
          class="btn preset-filled-surface-200-800 mt-2 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
          aria-disabled={$editor.searchRetrying}
          on:click={editor.retrySearch}
        >
          {$editor.searchRetrying ? $_('retrying') : $_('retry')}
        </button>
      </Alert>
    </div>
  {/if}
  {#each $editor.searchedNotes as { id, note } (id)}
    {#if note}
      <NoteListItem {note}>
        <div slot="footer">
          <button
            type="button"
            class="btn"
            class:preset-filled-surface-200-800={isUsed(id)}
            class:preset-tonal-primary={!isUsed(id)}
            on:click|preventDefault={() => toggle(id)}
          >
            {isUsed(id) ? $_('remove') : $_('add')}
          </button>
        </div>
      </NoteListItem>
    {:else}
      <Alert variant="warning">
        <p>{$_('alert.failed-to-get-note')}</p>
        <p class="break-all">{nip19.noteEncode(id)}</p>
      </Alert>
    {/if}
  {/each}
</div>
