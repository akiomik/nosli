<script lang="ts">
  import { getContext } from 'svelte';
  import { FontAwesomeIcon } from '@fortawesome/svelte-fontawesome';
  import { faBars, faSignal } from '@fortawesome/free-solid-svg-icons';
  import { AppBar } from '@skeletonlabs/skeleton-svelte';
  import { _ } from 'svelte-i18n';
  import type { RxNostr } from 'rx-nostr';

  import { relayConnectionsStore } from '$lib/stores/nostr';
  import KeyManager from '$lib/services/KeyManager';
  import MenuPopover from '$lib/components/MenuPopover.svelte';
  import RelayConnectionStatusListPopover from '$lib/components/RelayConnectionStatusListPopover.svelte';

  const client: RxNostr = getContext('nostr-client');
  const connections = relayConnectionsStore(client);

  let showRelayConnectionStatus = false;
  let showMenu = false;

  const handleRelayConnectionStatus = () =>
    (showRelayConnectionStatus = !showRelayConnectionStatus);
  const handleMenu = () => (showMenu = !showMenu);

  $: activeConnections = $connections?.filter(({ state }) => state === 'ongoing');
</script>

<AppBar background="bg-surface-50">
  {#snippet lead()}
    <a href="/">
      <span class="flex items-center">
        <img src="/favicon.svg" alt="Nosli icon" class="h-10 mr-1" width="40" height="40" />
        Nosli
      </span>
    </a>
  {/snippet}
  {#snippet trail()}
    <div class="relative">
      <button
        type="button"
        class="btn preset-tonal-surface bg-surface-100"
        on:click|stopPropagation={handleRelayConnectionStatus}
      >
        <span><FontAwesomeIcon icon={faSignal} title="Relay connections" /></span>
        <span>{activeConnections?.length ?? 0}/{$connections?.length ?? 0}</span>
      </button>

      <RelayConnectionStatusListPopover
        open={showRelayConnectionStatus && $connections !== undefined}
        connections={$connections ?? []}
        on:close={() => (showRelayConnectionStatus = false)}
      />
    </div>

    {#if KeyManager.isLoggedIn()}
      {#if KeyManager.isLoggedInWithNip07() || KeyManager.isLoggedInWithSecretKey()}
        <a href="/li/new" class="btn bg-primary-500">{$_('create')}</a>
      {/if}

      <div class="relative">
        <button class="btn-icon hover:preset-tonal-surface" on:click|stopPropagation={handleMenu}>
          <FontAwesomeIcon icon={faBars} title="Open menu" />
        </button>

        <MenuPopover
          open={showMenu}
          on:select={() => (showMenu = false)}
          on:close={() => (showMenu = false)}
        />
      </div>
    {:else}
      <a href="/login" class="btn bg-primary-500">{$_('login')}</a>
    {/if}
  {/snippet}
</AppBar>
