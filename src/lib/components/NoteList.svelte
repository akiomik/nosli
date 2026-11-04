<script lang="ts">
  import { nip19 } from 'nostr-tools';
  import { _ } from 'svelte-i18n';

  import type { LoadingNote } from '#lib/entities/LoadingNote.js';
  import ExternalLink from '#lib/components/ExternalLink.svelte';
  import NoteListItem from '#lib/components/NoteListItem.svelte';
  import Alert from '#lib/components/Alert.svelte';

  export let notes: LoadingNote[];
  // While the request runs, a note that has not arrived is still loading rather than missing.
  export let loading = false;
  // Whether the first note takes the focus, as after a retry, whose button has left the page.
  export let focus = false;

  $: first = notes.findIndex(({ note }) => note);
</script>

<div class="flex flex-col space-y-8">
  <!-- NOTE: Added index (i) to avoid duplication error -->
  {#each notes as { id, note }, i (`${id}-${i}`)}
    {#if note}
      <ExternalLink
        href="https://snort.social/e/{note.nip19Id()}"
        class="unstyled"
        focus={focus && i === first}
      >
        <NoteListItem {note} />
      </ExternalLink>
    {:else if loading}
      <div class="card p-4">
        <p>{$_('loading-note')}</p>
        <p class="break-all">{nip19.noteEncode(id)}</p>
      </div>
    {:else}
      <Alert variant="warning">
        <p>{$_('alert.failed-to-get-note')}</p>
        <p class="break-all">{nip19.noteEncode(id)}</p>
      </Alert>
    {/if}
  {:else}
    <Alert variant="warning">
      <p>{$_('no-notes-found')}</p>
    </Alert>
  {/each}
</div>
