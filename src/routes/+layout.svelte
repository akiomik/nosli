<script lang="ts">
  import { setContext } from 'svelte';
  import { AppShell, Toast } from '@skeletonlabs/skeleton';
  import '@skeletonlabs/skeleton/themes/theme-skeleton.css';
  import '@skeletonlabs/skeleton/styles/all.css';
  import '@fortawesome/fontawesome-svg-core/styles.css';
  import { config } from '@fortawesome/fontawesome-svg-core';
  import { createRxNostr } from 'rx-nostr';

  import { browser } from '$app/environment';
  import { beforeNavigate, afterNavigate } from '$app/navigation';
  import '../app.postcss';
  import * as settings from '$lib/services/settings';
  import { applyDarkMode, removeDarkMode } from '$lib/services/darkmode';
  import { resolveRelays } from '$lib/services/relayResolver';
  import KeyManager from '$lib/services/KeyManager';
  import { darkMode, relaySource, pubkey, nip07 } from '$lib/stores/cookie';
  import { currentRelays } from '$lib/stores/relays';
  import Header from '$lib/components/Header.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

  config.autoAddCss = false;

  let loading = false;
  let timeout: ReturnType<typeof setTimeout>;
  let relaysReady = !browser;

  const client = createRxNostr();
  setContext('nostr-client', client);

  $: if (browser) {
    if ($darkMode) {
      document.documentElement.setAttribute('data-darkmode', 'true');
      applyDarkMode();
    } else {
      document.documentElement.removeAttribute('data-darkmode');
      removeDarkMode();
    }
  }

  const BOOTSTRAP_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol'];

  async function applyRelaySource(source: typeof $relaySource) {
    if (!browser) return;
    relaysReady = false;

    let resolved: string[] | null = null;

    if (source === 'default') {
      resolved = settings.defaultRelays;
    } else {
      const pk = KeyManager.isLoggedIn() ? await KeyManager.getPublicKey() : null;
      if (pk) {
        const tmpClient = createRxNostr();
        tmpClient.setRelays(BOOTSTRAP_RELAYS);
        try {
          resolved = await resolveRelays(tmpClient, source, pk, settings.defaultRelays);
        } finally {
          tmpClient.dispose();
        }
      }

      if (!resolved) resolved = settings.defaultRelays;
    }

    client.setRelays(resolved);
    currentRelays.set(resolved);
    relaysReady = true;
  }

  $: if (browser) {
    void $pubkey;
    void $nip07;
    applyRelaySource($relaySource);
  }

  beforeNavigate(() => {
    timeout = setTimeout(() => {
      loading = true;
    }, 100);
  });

  afterNavigate(() => {
    clearTimeout(timeout);
    loading = false;
    if (browser && $darkMode) applyDarkMode();
  });
</script>

<Toast />

<AppShell>
  <svelte:fragment slot="header">
    <Header />
  </svelte:fragment>

  <div class="container mx-auto max-w-4xl p-4 space-y-8 mt-4">
    {#if loading || !relaysReady}
      <LoadingSpinner />
    {:else}
      <slot />
    {/if}
  </div>

  <svelte:fragment slot="footer">
    <hr />

    <Footer />
  </svelte:fragment>
</AppShell>
