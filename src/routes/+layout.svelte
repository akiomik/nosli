<script lang="ts">
  import { setContext } from 'svelte';
  import { AppShell } from '@skeletonlabs/skeleton';
  import '@skeletonlabs/skeleton/themes/theme-skeleton.css';
  import '@skeletonlabs/skeleton/styles/all.css';
  import '@fortawesome/fontawesome-svg-core/styles.css';
  import { config } from '@fortawesome/fontawesome-svg-core';
  import { createRxNostr } from 'rx-nostr';

  import { beforeNavigate, afterNavigate } from '$app/navigation';
  import '../app.postcss';
  import * as settings from '$lib/services/settings';
  import Header from '$lib/components/Header.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

  config.autoAddCss = false;

  let loading = false;
  let timeout: ReturnType<typeof setTimeout>;

  const client = createRxNostr();
  client.setRelays(settings.defaultRelays);
  setContext('nostr-client', client);

  beforeNavigate(() => {
    timeout = setTimeout(() => {
      loading = true;
    }, 100);
  });

  afterNavigate(() => {
    clearTimeout(timeout);
    loading = false;
  });
</script>

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
