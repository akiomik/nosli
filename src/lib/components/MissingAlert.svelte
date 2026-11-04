<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';

  import { focusWhen } from '#lib/actions/focusWhen.js';
  import Alert from '#lib/components/Alert.svelte';
  import type { Missing } from '#lib/stores/missing.js';

  export let missing: Missing;
  // What was not found, when relays answered.
  export let notFound: string;
  // Whether the button takes the focus, as it should after a retry, whose button has left the page.
  export let focus = false;

  const dispatch = createEventDispatcher<{ retry: void }>();
</script>

<!-- A request ends after a set time, so the relays may only have been slow, and can be asked again.
     Nothing found can be an ordinary answer, so only relays that did not answer are announced at
     once. -->
<div role={missing === 'unreachable' ? 'alert' : 'status'}>
  <Alert variant={missing === 'unreachable' ? 'warning' : ''}>
    <p>{missing === 'unreachable' ? $_('missing.unreachable') : notFound}</p>
    <button
      type="button"
      class="btn preset-filled-surface-200-800 mt-2"
      use:focusWhen={focus}
      on:click={() => dispatch('retry')}
    >
      {$_('retry')}
    </button>
  </Alert>
</div>
