<script lang="ts">
  import { nip19, getPublicKey } from 'nostr-tools';
  import NostrClient from '$lib/services/NostrClient';
  import Note from '$lib/entities/Note';
  import LongFormContent from '$lib/entities/LongFormContent';
  import Tag from '$lib/entities/Tag';
  import { key } from '$lib/stores/cookie';

  let title = 'Quotable Quote';
  let summary = 'by Arthur Conan Doyle';
  let identifier = 'matome-test';
  let noteIds = 'note1h2qtg2768r8w8k8ntthv3wawjq7tljks6zh4mxkguma4qztx6djsfg0mwa';
  let shareInNote = false;

  const client = new NostrClient(['wss://relay.damus.io', 'wss://relay.snort.social']);

  $: splittedNoteIds = noteIds.split('\n');
  $: areNoteIdsValid = splittedNoteIds.every((noteId: string) => {
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
    await client.connect();

    const seckey = nip19.decode($key).data;
    const pubkey = getPublicKey(seckey);

    const lfcContent = splittedNoteIds.map((_, i) => `#[${i + 3}]`).join('\n');
    let lfc = new LongFormContent(
      undefined,
      identifier,
      pubkey,
      lfcContent,
      new Date(),
      title,
      summary,
      undefined,
      undefined,
      splittedNoteIds.map((noteId) => {
        return new Tag('e', nip19.decode(noteId).data);
      })
    );
    lfc = await client.postLongFormContent(lfc, seckey);

    if (shareInNote) {
      const noteContent = `${title} is now published.`;
      const noteTags = [
        new Tag('e', lfc.id, '', 'mention'),
        new Tag('p', lfc.pubkey),
        new Tag('a', `${LongFormContent.KIND}:${pubkey}:${identifier}`)
      ];
      const note = new Note(
        undefined,
        noteContent,
        pubkey,
        new Date(),
        noteTags,
        undefined,
        undefined
      );

      await client.postNote(note, seckey);
    }
  };
</script>

<p>create matome</p>

<form>
  <label>
    title
    <input type="text" required bind:value={title} />
  </label>

  <label>
    summary
    <textarea bind:value={summary} />
  </label>

  <label>
    identifier
    <input type="text" bind:value={identifier} required />
  </label>

  <label>
    note ids (newline separated)
    <textarea bind:value={noteIds} required />
  </label>

  <label>
    <input type="checkbox" bind:checked={shareInNote} />
    share this matome in a note
  </label>

  <button on:click={onCreate} disabled={!areNoteIdsValid}>create</button>
</form>
