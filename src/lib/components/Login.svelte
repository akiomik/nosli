<script lang="ts">
  import { browser } from '$app/environment';
  import { nip19 } from 'nostr-tools';
  import { key as keyCookie } from '$lib/stores/cookie.js';

  let key: string = $keyCookie; // TODO: support NIP-07

  const keyIsValid = (key) => {
    if (!key.startsWith('npub') && !key.startsWith('nsec')) {
      return false;
    }

    try {
      nip19.decode(key);
      return true;
    } catch {
      return false;
    }
  };

  const onLogin = () => {
    if (browser && keyIsValid(key)) {
      $keyCookie = key;
    }
  };
</script>

<label>
  key (npub | nsec)
  <input type="text" bind:value={key} required />
</label>

<button type="submit" on:click={onLogin} disabled={!keyIsValid(key)}>login</button>
