<script lang="ts">
  import { browser } from '$app/environment';
  import { nip19 } from 'nostr-tools';
  import { key as keyCookie } from '$lib/stores/cookie.js';

  let key: string | undefined = undefined; // TODO: support NIP-07

  const keyIsValid = (key: string | undefined) => {
    if (key === undefined || (!key.startsWith('npub') && !key.startsWith('nsec'))) {
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

<h1>nostr-matome</h1>

<h2>Login</h2>

<label class="label">
  key (npub | nsec)
  <input
    type="text"
    bind:value={key}
    required
    class="input"
    class:input-error={key !== undefined && !keyIsValid(key)}
  />
</label>

<button type="submit" on:click={onLogin} disabled={!keyIsValid(key)} class="btn bg-surface-300">
  login
</button>
