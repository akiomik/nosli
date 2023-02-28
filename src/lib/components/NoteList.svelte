<script lang="ts">
  import type Note from '$lib/entities/Note';
  import ExternalLink from '$lib/components/ExternalLink.svelte';
  import NoteListItem from '$lib/components/NoteListItem.svelte';
  import Alert from '$lib/components/Alert.svelte';

  export let notes: Note[];
</script>

<div class="flex flex-col space-y-8">
  {#each notes as note}
    <ExternalLink href="https://snort.social/e/{note.nip19Id()}" class="unstyled">
      <NoteListItem {note} />
    </ExternalLink>
  {:else}
    <Alert>
      <p>No data found &#128064;</p>
    </Alert>
  {/each}
</div>
