<script lang="ts" module>
  let count = 0;
</script>

<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';

  import { focusWhen } from '#lib/actions/focusWhen.js';

  // For a form whose own Cancel button quits it.
  export let cancelLabel: string | undefined = undefined;
  export let centered = false;
  // False inside a live region, which announces the message itself.
  export let live = true;
  // Whether the button takes the focus, as it should when it replaces the one that the user pressed.
  export let focus = false;

  const dispatch = createEventDispatcher<{ cancel: void }>();
  // The button is described by the message, since a form can have another Cancel button.
  const messageId = `nip07-waiting-${++count}`;
</script>

<!-- Shown from the start, since the extension may never answer. -->
<div class="flex flex-col gap-2" class:items-center={centered} class:text-center={centered}>
  <p id={messageId} role={live ? 'status' : undefined}>{$_('nip07-waiting')}</p>
  <button
    type="button"
    class="btn preset-filled-surface-200-800 w-fit"
    aria-describedby={messageId}
    use:focusWhen={focus}
    on:click={() => dispatch('cancel')}
  >
    {cancelLabel ?? $_('cancel')}
  </button>
</div>
