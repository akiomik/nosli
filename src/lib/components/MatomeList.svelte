<script lang="ts">
  import type LongFormContent from '$lib/entities/LongFormContent';
  import type Profile from '$lib/entities/Profile';
  import MatomeListItem from '$lib/components/MatomeListItem.svelte';
  import Alert from '$lib/components/Alert.svelte';

  export let matomes: LongFormContent[];
  export let profilesByPubkey: Record<string, Profile>;
</script>

{#if matomes.length === 0}
  <Alert>
    <p>No lists found &#x1f914;</p>
  </Alert>
{:else}
  <div class="flex flex-col space-y-4">
    {#each matomes as matome}
      {#if matome.id}
        <a href="/li/{matome.nip19Id()}" class="unstyled">
          <MatomeListItem {matome} profile={profilesByPubkey[matome.pubkey]} />
        </a>
      {/if}
    {/each}
  </div>
{/if}
