<script lang="ts">
  import { nip19 } from 'nostr-tools';
  import { _ } from 'svelte-i18n';

  import type { LoadingNote } from '$lib/entities/LoadingNote';
  import ExternalLink from '$lib/components/ExternalLink.svelte';
  import NoteListItem from '$lib/components/NoteListItem.svelte';
  import Alert from '$lib/components/Alert.svelte';

  export let notes: LoadingNote[];
</script>

<div class="flex flex-col space-y-8">
  <!-- NOTE: Added index (i) to avoid duplication error -->
  {#each notes as { id, note }, i (`${id}-${i}`)}
    {#if note}
      <ExternalLink href="https://snort.social/e/{note.nip19Id()}" class="unstyled">
        <NoteListItem {note} />
      </ExternalLink>
    {:else}
      <Alert variant="warning">
        <p>{$_('alert.failed-to-get-note')}</p>
        <p>{nip19.noteEncode(id)}</p>
      </Alert>
    {/if}
  {:else}
    <Alert variant="warning">
      <p>No data found &#128064;</p>
    </Alert>
  {/each}
</div>
