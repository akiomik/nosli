<script lang="ts">
  import type LongFormContent from '$lib/entities/LongFormContent';
  import MatomeListItem from '$lib/components/MatomeListItem.svelte';
  import Alert from '$lib/components/Alert.svelte';

  export let matomes: LongFormContent[];
</script>

{#if matomes.length === 0}
  <Alert>
    <p>No lists found &#x1f914;</p>
  </Alert>
{:else}
  <div class="flex flex-col space-y-4">
    <!-- TODO: To avoid duplication, make this unique by pubkey and identifier -->
    {#each matomes as matome (matome.id)}
      {#if matome.id}
        <a href="/li/{matome.nip19Id()}" class="unstyled">
          <MatomeListItem {matome} />
        </a>
      {/if}
    {/each}
  </div>
{/if}
