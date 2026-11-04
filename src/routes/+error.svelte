<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/state';

  // The statuses that the app's pages and SvelteKit use. Others keep their own message.
  const messages: Record<number, string> = {
    401: 'error.unauthorized',
    404: 'error.not-found',
    500: 'error.internal'
  };

  $: key = messages[page.status];
  $: message = key ? $_(key) : page.error?.message;
</script>

<svelte:head>
  <title>{page.status} {message} | Nosli</title>
</svelte:head>

<h1 class="text-3xl md:text-5xl font-heading-token">{page.status}</h1>
<p>{message}</p>
