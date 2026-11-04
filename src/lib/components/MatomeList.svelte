<script lang="ts">
  import { _ } from 'svelte-i18n';

  import { focusWhen } from '#lib/actions/focusWhen.js';

  import type LongFormContent from '#lib/entities/LongFormContent.js';
  import MatomeListItem from '#lib/components/MatomeListItem.svelte';
  import Alert from '#lib/components/Alert.svelte';
  import MissingAlert from '#lib/components/MissingAlert.svelte';
  import type { Missing } from '#lib/stores/missing.js';

  export let matomes: LongFormContent[];
  // Why there are no lists, when they can be asked for again.
  export let missing: Missing | undefined = undefined;
  // Whether the first list, or the retry button, takes the focus, as after a retry.
  export let focus = false;
</script>

{#if matomes.length === 0 && missing}
  <MissingAlert {missing} notFound={$_('no-lists-found')} {focus} on:retry />
{:else if matomes.length === 0}
  <Alert>
    <p>{$_('no-lists-found')}</p>
  </Alert>
{:else}
  <div class="flex flex-col space-y-4">
    <!-- TODO: To avoid duplication, make this unique by pubkey and identifier -->
    {#each matomes as matome, i (matome.id)}
      {#if matome.id}
        <a href="/li/{matome.nip19Id()}" class="unstyled" use:focusWhen={focus && i === 0}>
          <MatomeListItem {matome} />
        </a>
      {/if}
    {/each}
  </div>
{/if}
