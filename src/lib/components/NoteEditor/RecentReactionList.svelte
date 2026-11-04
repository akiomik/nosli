<script lang="ts">
  import { nip19 } from 'nostr-tools';
  import { _ } from 'svelte-i18n';

  import NoteListItem from '#lib/components/NoteListItem.svelte';
  import type { NoteEditorStore } from '#lib/stores/noteEditor.js';
  import { loginMethod } from '#lib/stores/login.js';
  import Alert from '#lib/components/Alert.svelte';
  import Nip07Waiting from '#lib/components/Nip07Waiting.svelte';
  import { focusWhen } from '#lib/actions/focusWhen.js';

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

  let retried = false;
  const retry = () => {
    retried = true;
    editor.retrySearch();
  };
</script>

<!-- Takes the focus from the retry button once a retry has found the reactions. -->
<div class="flex flex-col space-y-8" tabindex="-1" use:focusWhen={retried && !$editor.searchFailed}>
  {#if $editor.searchFailed}
    <div role="alert">
      <Alert variant="warning">
        <p>
          {$editor.searchCanceled
            ? $_('alert.nip07-canceled')
            : $_('alert.failed-to-get-public-key')}
        </p>
        <!-- Unlike disabled, aria-disabled keeps the focus on the button while the retry runs. -->
        <button
          type="button"
          class="btn preset-filled-surface-200-800 mt-2 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
          aria-disabled={$editor.searchRetrying}
          use:focusWhen={$editor.searchCanceled && !$editor.searchRetrying}
          on:click={retry}
        >
          {$editor.searchRetrying ? $_('retrying') : $_('retry')}
        </button>
      </Alert>
    </div>
    <!-- Outside the alert, which would announce the wait assertively. -->
    <div aria-live="polite">
      {#if $editor.searchAwaitingKey && $loginMethod === 'nip07'}
        <Nip07Waiting
          live={false}
          cancelLabel={$_('cancel-getting-public-key')}
          on:cancel={editor.cancelSearch}
        />
      {/if}
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
