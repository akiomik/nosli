<script lang="ts">
  import { onDestroy } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import NostrClient from '$lib/services/NostrClient';
  import Note from '$lib/entities/Note';
  import LongFormContent from '$lib/entities/LongFormContent';
  import Tag from '$lib/entities/Tag';
  import { pubkey, seckey } from '$lib/stores/cookie';

  export let matome: LongFormContent | undefined = undefined;

  let title: string | undefined = matome?.title;
  let summary: string | undefined = matome?.summary;
  let identifier: string | undefined = matome?.identifier;
  let noteIds: string | undefined = matome?.noteIds()?.join('\n');
  let shareInNote = false;

  const client = new NostrClient(['wss://relay.damus.io', 'wss://relay.snort.social']);

  $: splittedNoteIds = noteIds?.split('\n');
  $: isIdentifierValid =
    identifier !== undefined && identifier.length > 0 && identifier.length <= 40;
  $: isTitleValid = title !== undefined && title.length > 0 && title.length <= 150;
  $: isSummaryValid = summary === undefined || summary.length <= 300;
  $: areNoteIdsValid =
    splittedNoteIds !== undefined &&
    splittedNoteIds.every((noteId: string) => {
      if (!noteId.startsWith('note')) {
        return false;
      }

      try {
        nip19.decode(noteId);
        return true;
      } catch {
        return false;
      }
    });

  const onCreate = async () => {
    if (identifier === undefined || title === undefined || splittedNoteIds === undefined) {
      throw new Error('Unexpected error: identifier or title is undefined');
    }

    await client.connect();

    const lfcContent = splittedNoteIds.map((_, i) => `#[${i + 3}]`).join('\n');
    const tags = [
      ...splittedNoteIds.map((noteId) => {
        const id = nip19.decode(noteId).data;
        if (typeof id !== 'string') {
          throw new Error('Unexpected error: noteId is not string');
        }

        return new Tag('e', id, '', 'mention');
      }),
      new Tag('t', 'matome')
    ];
    let lfc = new LongFormContent(
      undefined,
      identifier,
      $pubkey,
      lfcContent,
      new Date(),
      title,
      summary || '',
      undefined,
      undefined,
      tags
    );
    lfc = await client.postLongFormContent(lfc, $seckey);

    if (shareInNote && lfc.id) {
      const noteContent = `${title} is now published.`;
      const noteTags = [
        new Tag('e', lfc.id, '', 'mention'),
        new Tag('p', $pubkey),
        new Tag('a', `${LongFormContent.KIND}:${$pubkey}:${identifier}`)
      ];
      const note = new Note(undefined, noteContent, $pubkey, new Date(), noteTags, undefined);

      await client.postNote(note, $seckey);
    }

    window.location.href = `/matome/${lfc.nip19Id()}`;
  };

  const onCancel = () => {
    if (confirm('Quit editing?')) {
      const path = matome ? `/matome/${matome.nip19Id()}` : '/';
      window.location.href = path;
    }
  };

  onDestroy(async () => {
    await client.close();
  });
</script>

<form class="flex flex-col space-y-4">
  <label class="label">
    Identifier (required)
    <input
      type="text"
      bind:value={identifier}
      required
      class="input"
      class:input-error={identifier !== undefined && !isIdentifierValid}
      maxlength="40"
    />
  </label>

  <label class="label">
    Title (required)
    <input
      type="text"
      bind:value={title}
      required
      class="input"
      class:input-error={title !== undefined && !isTitleValid}
      maxlength="150"
      placeholder="My awesome notes"
    />
  </label>

  <label class="label">
    Summary
    <textarea
      bind:value={summary}
      class="textarea"
      class:input-error={summary !== undefined && !isSummaryValid}
      maxlength="300"
    />
  </label>

  <label class="label">
    Note ids (newline separated, required)
    <textarea
      bind:value={noteIds}
      required
      class="textarea"
      class:input-error={noteIds !== undefined && !areNoteIdsValid}
      rows="8"
      placeholder="note...."
    />
  </label>

  <label class="label">
    <input type="checkbox" bind:checked={shareInNote} class="checkbox" />
    Share this matome in a note
  </label>

  <div>
    <button on:click={onCancel} class="btn bg-surface-300">Cancel</button>
    <button
      on:click={onCreate}
      disabled={!isIdentifierValid || !isTitleValid || !isSummaryValid || !areNoteIdsValid}
      class="btn bg-primary-500"
    >
      {#if matome}
        Update
      {:else}
        Create
      {/if}
    </button>
  </div>
</form>
