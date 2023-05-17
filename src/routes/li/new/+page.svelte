<script lang="ts">
  import MatomeForm from '$lib/components/MatomeForm.svelte';
  import type { PageData } from './$types';
  import type RxNostrClient from '$lib/services/RxNostrClient';

  export let data: PageData & {
    client?: RxNostrClient;
  };
</script>

<svelte:head>
  <title>Create a new list | Nosli</title>
</svelte:head>

<h1>Create a new list</h1>

{#if data.client}
  <MatomeForm rxClient={data.client} />
{/if}
