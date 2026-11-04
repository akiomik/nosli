<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import { Toast } from '@skeletonlabs/skeleton-svelte';
  import '@fortawesome/fontawesome-svg-core/styles.css';
  import { config } from '@fortawesome/fontawesome-svg-core';
  import { createRxNostr } from 'rx-nostr';
  import { _ } from 'svelte-i18n';

  import { beforeNavigate, afterNavigate, invalidate } from '$app/navigation';
  import '../app.css';
  import * as settings from '#lib/services/settings.js';
  import KeyManager from '#lib/services/KeyManager.js';
  import Header from '#lib/components/Header.svelte';
  import Footer from '#lib/components/Footer.svelte';
  import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';
  import { LOGIN_DEPENDENCY } from '#lib/stores/login.js';
  import { toaster } from '#lib/stores/toaster.js';

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

  onMount(async () => {
    if (!(await KeyManager.logoutIfNip07Missing())) return;

    toaster.warning({ title: $_('alert.nip07-logged-out') });
    // Pages that need a login check it again.
    await invalidate(LOGIN_DEPENDENCY);
  });
</script>

<!-- Replaces Zag's English label, which also names the placement. -->
<Toast.Group {toaster} aria-label={$_('notifications')}>
  {#snippet children(toast)}
    <Toast {toast}>
      <Toast.Message>
        <Toast.Title>{toast.title}</Toast.Title>
        <Toast.Description>{toast.description}</Toast.Description>
      </Toast.Message>
      <Toast.CloseTrigger aria-label={$_('dismiss-notification')} />
    </Toast>
  {/snippet}
</Toast.Group>

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
