<script lang="ts">
  import { browser } from '$app/environment';
  import { nip19, getPublicKey } from 'nostr-tools';
  import { pubkey, seckey } from '$lib/stores/cookie.js';

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
    if (browser && typeof key === 'string' && keyIsValid(key)) {
      const decoded = nip19.decode(key).data;
      if (typeof decoded !== 'string') {
        throw new Error('Unexpected error: decoded key is not string');
      }

      if (key.startsWith('npub')) {
        $pubkey = decoded;
      } else {
        $seckey = decoded;
        $pubkey = getPublicKey(decoded);
      }

      window.location.href = `/p/${nip19.npubEncode($pubkey)}`;
    }
  };
</script>

<label class="label">
  key (npub | nsec)
  <input
    type="password"
    bind:value={key}
    required
    class="input"
    class:input-error={key !== undefined && !keyIsValid(key)}
  />
</label>

<button type="submit" on:click={onLogin} disabled={!keyIsValid(key)} class="btn bg-surface-300">
  Login
</button>
