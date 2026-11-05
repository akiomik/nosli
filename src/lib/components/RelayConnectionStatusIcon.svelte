<script lang="ts">
  import type { ConnectionState } from 'rx-nostr';
  import { FontAwesomeIcon } from '@fortawesome/svelte-fontawesome';
  import { faCircle } from '@fortawesome/free-solid-svg-icons';
  import { _ } from 'svelte-i18n';

  export let status: ConnectionState;

  // Gray while there is no connection to wait for, and red when it failed or is lost. It fades while
  // the connection is being made.
  const looks: Record<ConnectionState, { color: string; fade: boolean }> = {
    initialized: { color: 'text-surface-500', fade: false },
    connecting: { color: 'text-surface-500', fade: true },
    connected: { color: 'text-primary-500', fade: false },
    'waiting-for-retrying': { color: 'text-error-500', fade: true },
    retrying: { color: 'text-error-500', fade: true },
    dormant: { color: 'text-surface-500', fade: false },
    error: { color: 'text-error-500', fade: false },
    rejected: { color: 'text-error-500', fade: false },
    terminated: { color: 'text-surface-500', fade: false }
  };

  $: look = looks[status] ?? looks.error;
</script>

<!-- FontAwesomeIcon draws the icon once, so it is drawn again for each state. -->
{#key status}
  <FontAwesomeIcon
    icon={faCircle}
    title={$_(`relay-status.${status}`)}
    class="text-xs {look.color}"
    fade={look.fade}
  />
{/key}
