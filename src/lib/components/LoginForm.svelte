<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { nip19, getPublicKey } from 'nostr-tools';
  import { _ } from 'svelte-i18n';

  import { pubkey, seckey, nip07 } from '$lib/stores/cookie.js';
  import Alert from '$lib/components/Alert.svelte';
  import ExternalLink from '$lib/components/ExternalLink.svelte';

  let key: string | undefined = undefined; // TODO: support NIP-07

  $: isNip07Available = browser && !!window.nostr;

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

  const onLoginWithNip07 = async () => {
    if (!window.nostr?.getPublicKey) {
      return;
    }

    try {
      const npub = await window.nostr.getPublicKey();
      $nip07 = true;
      goto(`/p/${nip19.npubEncode(npub)}`);
    } catch (e) {
      alert(e);
    }
  };

  const onLoginWithKey = () => {
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

      goto(`/p/${nip19.npubEncode($pubkey)}`);
    }
  };
</script>

<h2>{$_('login-with-nip07')}</h2>

{#if browser && !isNip07Available}
  <Alert variant="warning">
    <p>
      {$_('alert.nip07-unavailable')}
      {$_('see-other')}
      <ExternalLink href="https://github.com/nostr-protocol/nips/blob/master/07.md#implementation">
        {$_('nip07-implementations')}
      </ExternalLink>
      {$_('.')}
    </p>
  </Alert>
{/if}

<button
  type="submit"
  on:click={onLoginWithNip07}
  disabled={!isNip07Available}
  class="btn bg-surface-300"
>
  {$_('login')}
</button>

<h2>{$_('login-with-key')}</h2>

<label class="label">
  {$_('key')} (npub | nsec)
  <input
    type="password"
    bind:value={key}
    required
    class="input"
    class:input-error={key !== undefined && !keyIsValid(key)}
  />
</label>

<button
  type="submit"
  on:click={onLoginWithKey}
  disabled={!keyIsValid(key)}
  class="btn bg-surface-300"
>
  {$_('login')}
</button>
