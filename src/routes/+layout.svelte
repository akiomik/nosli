<script lang="ts">
  import { setContext } from 'svelte';
  import { Toaster } from '@skeletonlabs/skeleton-svelte';
  import '@fortawesome/fontawesome-svg-core/styles.css';
  import { config } from '@fortawesome/fontawesome-svg-core';
  import { createRxNostr } from 'rx-nostr';

  import { beforeNavigate, afterNavigate } from '$app/navigation';
  import '../app.css';
  import * as settings from '$lib/services/settings';
  import Header from '$lib/components/Header.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import { toaster } from '$lib/stores/toaster';

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

<Toaster {toaster} />

<div class="min-h-screen flex flex-col">
  <Header />

  <main class="container mx-auto max-w-4xl p-4 space-y-8 mt-4 flex-1">
    {#if loading}
      <LoadingSpinner />
    {:else}
      <slot />
    {/if}
  </main>

  <footer>
    <hr />
    <Footer />
  </footer>
</div>
