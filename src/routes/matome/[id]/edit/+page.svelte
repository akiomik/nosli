<script lang="ts">
  import { onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import type { PageData } from './$types';
  import type LongFormContent from '$lib/entities/LongFormContent';
  import type NostrClient from '$lib/services/NostrClient';
  import MatomeForm from '$lib/components/MatomeForm.svelte';

  export let data: PageData & {
    matome: LongFormContent | undefined;
    client: NostrClient | undefined;
  };

  onDestroy(async () => {
    if (browser && data.client !== undefined) {
      await data.client.close();
    }
  });
</script>

<svelte:head>
  {#if data.matome}
    <title>Edit {data.matome.identifier} | Nosli</title>
  {/if}
</svelte:head>

{#if data.matome}
  <h1>Edit {data.matome.identifier}</h1>

  <MatomeForm matome={data.matome} />
{/if}
