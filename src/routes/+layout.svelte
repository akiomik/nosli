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
  import { darkMode } from '$lib/stores/cookie';
  import Header from '$lib/components/Header.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

  config.autoAddCss = false;

  let loading = false;
  let timeout: ReturnType<typeof setTimeout>;

  const client = createRxNostr();
  client.setRelays(settings.defaultRelays);
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
    {#if loading}
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
