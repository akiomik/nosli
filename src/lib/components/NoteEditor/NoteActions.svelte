<script lang="ts">
  import { FontAwesomeIcon } from '@fortawesome/svelte-fontawesome';
  import { faAngleUp, faAngleDown } from '@fortawesome/free-solid-svg-icons';
  import { _ } from 'svelte-i18n';

  import type { NoteEditorStore } from '#lib/stores/noteEditor.js';

  export let editor: NoteEditorStore;
  export let noteId: string;
  export let isFirst: boolean;
  export let isLast: boolean;
</script>

<div class="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
  <div class="btn-group preset-filled-surface-200-800">
    <button on:click|preventDefault={() => editor.moveUp(noteId)} disabled={isFirst}>
      <FontAwesomeIcon icon={faAngleUp} title="Move Up" />
    </button>

    <button on:click|preventDefault={() => editor.moveDown(noteId)} disabled={isLast}>
      <FontAwesomeIcon icon={faAngleDown} title="Move Down" />
    </button>
  </div>

  <button
    type="button"
    class="btn preset-tonal-error"
    on:click|preventDefault={() => editor.removeNote(noteId)}
  >
    {$_('remove')}
  </button>
</div>
