<script lang="ts">
  import { nip19, getPublicKey } from 'nostr-tools';
  import NostrClient from '$lib/services/NostrClient';
  import Note from '$lib/entities/Note';
  // import Tag from '$lib/entities/Tag';
  import { key } from '$lib/stores/cookie';

  let title = 'Test note';
  let description = '*YOU ARE NOT AUTHORIZED TO READ THIS CONTENT*';

  const client = new NostrClient(['wss://relay.damus.io', 'wss://relay.snort.social']);

  const onCreate = async () => {
    await client.connect();
    const content = `${title}\n${description}`;
    const seckey = nip19.decode($key).data;
    const pubkey = getPublicKey(seckey);
    const tags = []; // TODO: set addr
    const note = new Note(undefined, content, pubkey, new Date(), tags, undefined, undefined);
    await client.postNote(note, seckey);
  };
</script>

<p>create matome</p>

<label>
  title
  <input type="text" required bind:value={title} />
</label>

<label>
  description
  <input type="text" bind:value={description} />
</label>

<label>
  identifier
  <input type="text" required value="test" />
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
