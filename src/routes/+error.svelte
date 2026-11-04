<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/state';

  // The statuses that the app's pages and SvelteKit use. Others keep their own message.
  const messages: Record<number, string> = {
    401: 'error.unauthorized',
    404: 'error.not-found',
    500: 'error.internal'
  };

  // Called from the markup, since a $: statement would not follow page.status and page.error from
  // one error to the next.
  const messageFor = (t: (id: string) => string, status: number, error: typeof page.error) =>
    status in messages ? t(messages[status]) : error?.message;
</script>

<svelte:head>
  <title>{page.status} {messageFor($_, page.status, page.error)} | Nosli</title>
</svelte:head>

<h1 class="text-3xl md:text-5xl font-heading-token">{page.status}</h1>
<p>{messageFor($_, page.status, page.error)}</p>
