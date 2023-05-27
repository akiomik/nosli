<script lang="ts">
  import type { ConnectionState } from 'rx-nostr';
  import { FontAwesomeIcon } from '@fortawesome/svelte-fontawesome';
  import { faCircle } from '@fortawesome/free-solid-svg-icons';

  export let status: ConnectionState;
</script>

{#if status === 'not-started'}
  <FontAwesomeIcon icon={faCircle} title="Not connected" class="text-xs text-surface-500" />
{:else if status === 'starting'}
  <FontAwesomeIcon
    icon={faCircle}
    title="Connecting"
    class="text-xs text-surface-500"
    fade={true}
  />
{:else if status === 'ongoing'}
  <FontAwesomeIcon icon={faCircle} title="Connected" class="text-xs text-primary-500" />
{:else if status === 'reconnecting'}
  <FontAwesomeIcon
    icon={faCircle}
    title="Reconnecting"
    class="text-xs text-error-500"
    fade={true}
  />
{:else}
  <FontAwesomeIcon icon={faCircle} title="Error" class="text-xs text-error-500" />
{/if}
