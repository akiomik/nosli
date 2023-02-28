<script lang="ts">
  // import { browser } from '$app/environment';
  import type { PageData } from './$types';
  import type NostrClient from '$lib/services/NostrClient';
  import type LongFormContent from '$lib/entities/LongFormContent';
  // import Note from '$lib/entities/Note';
  import ExternalLink from '$lib/components/ExternalLink.svelte';

  export let data: PageData & {
    matome: LongFormContent | undefined;
    client: NostrClient | undefined;
  };

  // let notes: Promise<Note>[] = [];
  // if (browser) {
  //   const noteIds = data.matome.content.split('\n');
  //   noteIds.map((noteId) => {
  //     data.client.getNote(noteId);
  //   });
  // }
</script>

{#if data.matome}
  <h1>{data.matome.title}</h1>
  {#if data.matome.summary}
    <p>{data.matome.summary}</p>
  {/if}
  <p>
    author:
    <ExternalLink href="https://snort.social/p/{data.matome.pubkey}">
      {data.matome.pubkey.slice(0, 8)}:{data.matome.pubkey.slice(-8)}
    </ExternalLink>
  </p>
  <p>{data.matome.content}</p>
  <!-- <ul> -->
  <!--   {#each notes as note} -->
  <!--     <ExternalLink href="https://snort.social/e/{note.nip19Id()}"> -->
  <!--       <li> -->
  <!--         <p>note.content</p> -->
  <!--       </li> -->
  <!--     </ExternalLink> -->
  <!--   {/each} -->
  <!-- </ul> -->
{/if}

<!-- TODO: show edit button -->
