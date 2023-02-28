<script lang="ts">
  import { browser } from '$app/environment';
  import { nip19, getPublicKey } from 'nostr-tools';
  import { pubkey, seckey } from '$lib/stores/cookie.js';
  import ExternalLink from '$lib/components/ExternalLink.svelte';

  let key: string | undefined = undefined; // TODO: support NIP-07

  const title = 'Nosli | Create curated lists of posts on nostr';
  const desc = 'Nosli helps you create a curated list of posts on nostr';

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
    }
  };
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={desc} />
  <meta name="keywords" content="nosli,nostr,curated,list,posts,damus,snort" />
  <meta property="og:url" content="https://nosli.vercel.app" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={desc} />
</svelte:head>

<h1>Nosli</h1>

<p>
  {desc}
  <ExternalLink href="https://nostr.com">nostr</ExternalLink>.
</p>

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
