<script lang="ts">
  import { getContext } from 'svelte';
  import { FontAwesomeIcon } from '@fortawesome/svelte-fontawesome';
  import { faBars, faSignal } from '@fortawesome/free-solid-svg-icons';
  import { AppBar } from '@skeletonlabs/skeleton-svelte';
  import { _ } from 'svelte-i18n';
  import type { RxNostr } from 'rx-nostr';

  import { relayConnectionsStore } from '$lib/stores/nostr';
  import { loginMethod } from '$lib/stores/login';
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

<AppBar class="bg-surface-50">
  <!-- On a narrow screen, or with a large font, the buttons move below the logo instead of overflowing. -->
  <AppBar.Toolbar class="flex flex-wrap gap-y-2">
    <!-- The image's max-width: 100% would let the logo shrink to the width of the name, and the
         buttons would cover the name. -->
    <AppBar.Lead class="shrink-0">
      <a href="/">
        <span class="flex items-center">
          <img src="/favicon.svg" alt="Nosli icon" class="h-10 mr-1" width="40" height="40" />
          Nosli
        </span>
      </a>
    </AppBar.Lead>
    <!-- On a screen narrower than 16rem, the buttons take less padding so that they still fit on one
         line below the logo. Narrower still, they wrap. -->
    <AppBar.Trail class="flex-wrap justify-end ml-auto">
      <div class="relative">
        <button
          type="button"
          class="btn preset-tonal-surface bg-surface-100 max-[16rem]:px-2"
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

      {#if $loginMethod}
        {#if $loginMethod !== 'npub'}
          <a href="/li/new" class="btn bg-primary-500 max-[16rem]:px-2">{$_('create')}</a>
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
        <a href="/login" class="btn bg-primary-500 max-[16rem]:px-2">{$_('login')}</a>
      {/if}
    </AppBar.Trail>
  </AppBar.Toolbar>
</AppBar>
