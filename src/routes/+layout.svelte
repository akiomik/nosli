<script lang="ts">
  import { AppShell } from '@skeletonlabs/skeleton';
  import '@skeletonlabs/skeleton/themes/theme-skeleton.css';
  import '@skeletonlabs/skeleton/styles/all.css';
  import '@fortawesome/fontawesome-svg-core/styles.css';
  import { beforeNavigate, afterNavigate } from '$app/navigation';
  import '../app.postcss';
  import Header from '$lib/components/Header.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

  let loading = false;
  let timeout: number;

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

  <div class="container mx-auto p-4 space-y-8 mt-4">
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
