<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head>
  <title>{page.status} {page.error?.message} | Nosli</title>
</svelte:head>

<h1 class="text-3xl md:text-5xl font-heading-token">{page.status}</h1>
<p>{page.error?.message}</p>
