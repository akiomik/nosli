<script lang="ts">
  import { FontAwesomeIcon } from '@fortawesome/svelte-fontawesome';
  import { faAngleUp, faAngleDown } from '@fortawesome/free-solid-svg-icons';
  import type { NoteEditorStore } from '$lib/stores/noteEditor';

  export let editor: NoteEditorStore;
  export let noteId: string;
  export let isFirst: boolean;
  export let isLast: boolean;
</script>

<div class="flex items-center">
  <div class="btn-group variant-soft-surface ml-5">
    <button on:click|preventDefault={() => editor.moveUp(noteId)} disabled={isFirst}>
      <FontAwesomeIcon icon={faAngleUp} title="Move Up" />
    </button>

    <button on:click|preventDefault={() => editor.moveDown(noteId)} disabled={isLast}>
      <FontAwesomeIcon icon={faAngleDown} title="Move Down" />
    </button>
  </div>

  <button
    type="button"
    class="btn variant-soft-error ml-3"
    on:click|preventDefault={() => editor.removeNote(noteId)}
  >
    Remove
  </button>
</div>
