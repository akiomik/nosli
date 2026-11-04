<script lang="ts">
  import { getContext } from 'svelte';
  import { FontAwesomeIcon } from '@fortawesome/svelte-fontawesome';
  import { faBars, faSignal } from '@fortawesome/free-solid-svg-icons';
  import { AppBar, Popover } from '@skeletonlabs/skeleton-svelte';
  import { _ } from 'svelte-i18n';
  import type { RxNostr } from 'rx-nostr';

  import { relayConnectionsStore } from '$lib/stores/nostr';
  import { loginMethod } from '$lib/stores/login';
  import Menu from '$lib/components/Menu.svelte';
  import RelayConnectionStatusList from '$lib/components/RelayConnectionStatusList.svelte';

  const client: RxNostr = getContext('nostr-client');
  const connections = relayConnectionsStore(client);

  let showRelayConnectionStatus = false;
  let showMenu = false;

  $: activeConnections = $connections?.filter(({ state }) => state === 'ongoing');
</script>

<AppBar class="bg-surface-50">
  <!-- On a narrow screen, or with a large font, the buttons move below the logo instead of
       overflowing. -->
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
    <!-- On a screen narrower than 16rem, the buttons take less padding so that they still fit on
         one line below the logo. Narrower still, they wrap. -->
    <AppBar.Trail class="flex-wrap justify-end ml-auto">
      <!-- The popovers stay next to their buttons, not in a portal, so that they come after them in
           the tab order. Each keeps to the screen, sliding along it and taking at most its width. -->
      <Popover
        open={showRelayConnectionStatus && $connections !== undefined}
        onOpenChange={(e) => (showRelayConnectionStatus = e.open)}
        portalled={false}
        positioning={{ placement: 'bottom', gutter: 0, fitViewport: true }}
      >
        <Popover.Trigger class="btn preset-tonal-surface bg-surface-100 max-[16rem]:px-2">
          <span><FontAwesomeIcon icon={faSignal} title="Relay connections" /></span>
          <span>{activeConnections?.length ?? 0}/{$connections?.length ?? 0}</span>
        </Popover.Trigger>
        <Popover.Positioner>
          <Popover.Content class="card z-50 max-w-(--available-width) p-4 shadow-xl">
            <RelayConnectionStatusList connections={$connections ?? []} />
          </Popover.Content>
        </Popover.Positioner>
      </Popover>

      {#if $loginMethod}
        {#if $loginMethod !== 'npub'}
          <a href="/li/new" class="btn bg-primary-500 max-[16rem]:px-2">{$_('create')}</a>
        {/if}

        <Popover
          open={showMenu}
          onOpenChange={(e) => (showMenu = e.open)}
          portalled={false}
          positioning={{ placement: 'bottom-end', gutter: 0, fitViewport: true }}
        >
          <Popover.Trigger class="btn-icon hover:preset-tonal-surface">
            <FontAwesomeIcon icon={faBars} title="Open menu" />
          </Popover.Trigger>
          <Popover.Positioner>
            <Popover.Content class="card z-50 max-w-(--available-width) p-4 shadow-xl">
              <Menu open={showMenu} on:select={() => (showMenu = false)} />
            </Popover.Content>
          </Popover.Positioner>
        </Popover>
      {:else}
        <a href="/login" class="btn bg-primary-500 max-[16rem]:px-2">{$_('login')}</a>
      {/if}
    </AppBar.Trail>
  </AppBar.Toolbar>
</AppBar>
