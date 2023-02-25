<script lang="ts">
  import { browser } from '$app/environment';
  import { nip19 } from 'nostr-tools';
  import { npub as npubCookie } from '$lib/stores/cookie.js';

  let npub: string = $npubCookie; // TODO: support nsec and NIP-07

  const npubIsValid = (npub) => {
    if (!npub.startsWith('npub')) {
      return false;
    }

    try {
      nip19.decode(npub);
      return true;
    } catch {
      return false;
    }
  };

  const onLogin = () => {
    if (browser && npubIsValid(npub)) {
      $npubCookie = npub;
    }
  };
</script>

<label>
  npub
  <input type="text" bind:value={npub} required />
</label>

<button type="submit" on:click={onLogin} disabled={!npubIsValid(npub)}>login</button>
