<script lang="ts">
  import type Note from '$lib/entities/Note';
  import ExternalLink from '$lib/components/ExternalLink.svelte';
  import NoteListItem from '$lib/components/NoteListItem.svelte';
  import Alert from '$lib/components/Alert.svelte';

  export let notes: (Note | undefined)[];
</script>

<div class="flex flex-col space-y-8">
  {#each notes as note, i (i)}
    {#if note}
      <ExternalLink href="https://snort.social/e/{note.nip19Id()}" class="unstyled">
        <NoteListItem {note} />
      </ExternalLink>
    {:else}
      <Alert variant="warning">
        <p>Failed to get a note.</p>
      </Alert>
    {/if}
  {:else}
    <Alert variant="warning">
      <p>No data found &#128064;</p>
    </Alert>
  {/each}
</div>
