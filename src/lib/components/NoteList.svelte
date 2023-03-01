<script lang="ts">
  import type Note from '$lib/entities/Note';
  import type NostrClient from '$lib/services/NostrClient';
  import ExternalLink from '$lib/components/ExternalLink.svelte';
  import NoteListItem from '$lib/components/NoteListItem.svelte';
  import Alert from '$lib/components/Alert.svelte';

  export let notes: (Note | undefined)[];
  export let client: NostrClient;
</script>

<div class="flex flex-col space-y-8">
  {#each notes as note}
    {#if note}
      <ExternalLink href="https://snort.social/e/{note.nip19Id()}" class="unstyled">
        <NoteListItem {note} {client} />
      </ExternalLink>
    {:else}
      <Alert>
        <p>Failed to get a note.</p>
      </Alert>
    {/if}
  {:else}
    <Alert>
      <p>No data found &#128064;</p>
    </Alert>
  {/each}
</div>
