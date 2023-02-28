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

<h1>Edit a matome</h1>

{#if data.matome}
  <MatomeForm matome={data.matome} />
{/if}
