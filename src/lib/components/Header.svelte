<script lang="ts">
  import { getContext } from 'svelte';
  import { FontAwesomeIcon } from '@fortawesome/svelte-fontawesome';
  import { faBars, faSignal } from '@fortawesome/free-solid-svg-icons';
  import { AppBar } from '@skeletonlabs/skeleton';
  import { _ } from 'svelte-i18n';
  import type { RxNostr } from 'rx-nostr';

  import { base } from '$app/paths';
  import { relayConnectionsStore } from '$lib/stores/nostr';
  import KeyManager from '$lib/services/KeyManager';
  import { pubkey, nip07 } from '$lib/stores/cookie';
  import MenuPopover from '$lib/components/MenuPopover.svelte';
  import RelayConnectionStatusListPopover from '$lib/components/RelayConnectionStatusListPopover.svelte';
  import SettingsPopover from '$lib/components/SettingsPopover.svelte';

  const client: RxNostr = getContext('nostr-client');
  const connections = relayConnectionsStore(client);

  let showRelayConnectionStatus = false;
  let showMenu = false;
  let showSettings = false;

  const handleRelayConnectionStatus = () =>
    (showRelayConnectionStatus = !showRelayConnectionStatus);
  const handleMenu = () => (showMenu = !showMenu);
  const handleMenuSelect = (e: CustomEvent<string>) => {
    showMenu = false;
    if (e.detail === 'settings') showSettings = true;
  };

  $: activeConnections = $connections?.filter(({ state }) => state === 'ongoing');
  $: loggedIn = $pubkey || $nip07 ? KeyManager.isLoggedIn() : false;
  $: writable = $nip07 ? KeyManager.isWritableLoggedIn() : false;
</script>

<AppBar>
  <svelte:fragment slot="lead">
    <a href="{base}/">
      <span class="flex items-center">
        <img src="{base}/favicon.svg" alt="Nosli icon" class="h-10 mr-1" width="40" height="40" />
        Nosli - 魔改造 edition
      </span>
    </a>
  </svelte:fragment>
  <svelte:fragment slot="trail">
    <div class="relative">
      <button
        type="button"
        class="btn variant-soft-surface"
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

    {#if writable}
      <a href="{base}/li/new" class="btn bg-primary-500">{$_('create')}</a>
    {/if}

    {#if !loggedIn}
      <a href="{base}/login" class="btn bg-primary-500">{$_('login')}</a>
    {/if}

    <div class="relative">
      <button class="btn-icon hover:variant-soft-surface" on:click|stopPropagation={handleMenu}>
        <FontAwesomeIcon icon={faBars} title="Open menu" />
      </button>

      <MenuPopover
        open={showMenu}
        on:select={handleMenuSelect}
        on:close={() => (showMenu = false)}
      />

      <SettingsPopover open={showSettings} on:close={() => (showSettings = false)} />
    </div>
  </svelte:fragment>
</AppBar>
