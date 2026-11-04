<script lang="ts">
  import type { ConnectionState } from 'rx-nostr';
  import { FontAwesomeIcon } from '@fortawesome/svelte-fontawesome';
  import { faCircle } from '@fortawesome/free-solid-svg-icons';
  import { _ } from 'svelte-i18n';

  export let status: ConnectionState;
</script>

{#if status === 'not-started'}
  <FontAwesomeIcon
    icon={faCircle}
    title={$_('relay-status.not-started')}
    class="text-xs text-surface-500"
  />
{:else if status === 'starting'}
  <FontAwesomeIcon
    icon={faCircle}
    title={$_('relay-status.starting')}
    class="text-xs text-surface-500"
    fade={true}
  />
{:else if status === 'ongoing'}
  <FontAwesomeIcon
    icon={faCircle}
    title={$_('relay-status.ongoing')}
    class="text-xs text-primary-500"
  />
{:else if status === 'reconnecting'}
  <FontAwesomeIcon
    icon={faCircle}
    title={$_('relay-status.reconnecting')}
    class="text-xs text-error-500"
    fade={true}
  />
{:else}
  <FontAwesomeIcon
    icon={faCircle}
    title={$_('relay-status.error')}
    class="text-xs text-error-500"
  />
{/if}
