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

  const client = new NostrClient(['wss://relay.damus.io', 'wss://relay.snort.social']);

  const onCreate = async () => {
    await client.connect();

    const seckey = nip19.decode($key).data;
    const pubkey = getPublicKey(seckey);

    const lfcContent =
      'To Sherlock Holmes she is always the woman. I have seldom heard him mention her under any other name. In his eyes she eclipses and predominates the whole of her sex.';
    let lfc = new LongFormContent(
      undefined,
      identifier,
      pubkey,
      lfcContent,
      new Date(),
      title,
      summary,
      undefined,
      undefined
    );
    lfc = await client.postLongFormContent(lfc, seckey);

    const noteContent = `${title} is now published.`;
    const noteTags = [
      new Tag('e', lfc.id),
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
  };
</script>

<p>create matome</p>

<label>
  title
  <input type="text" required bind:value={title} />
</label>

<label>
  summary
  <input type="text" bind:value={summary} />
</label>

<label>
  identifier
  <input type="text" bind:value={identifier} required />
</label>

<label>
  note ids
  <input
    type="text"
    required
    value="note1h2qtg2768r8w8k8ntthv3wawjq7tljks6zh4mxkguma4qztx6djsfg0mwa"
  />
</label>

<button on:click={onCreate}>create</button>
