<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/env';
  import { goto } from '$app/navigation';
  import { nip19, getPublicKey } from 'nostr-tools';
  import { _ } from 'svelte-i18n';

  import { focusWhen } from '#lib/actions/focusWhen.js';
  import { pubkey, seckey, nip07 } from '#lib/stores/cookie.js';
  import KeyManager, { Nip07CanceledError } from '#lib/services/KeyManager.js';
  import Alert from '#lib/components/Alert.svelte';
  import ExternalLink from '#lib/components/ExternalLink.svelte';
  import Nip07Waiting from '#lib/components/Nip07Waiting.svelte';

  let key: string | undefined = undefined; // TODO: support NIP-07

  // Undefined while an extension that is still loading is waited for.
  let isNip07Available: boolean | undefined = undefined;
  onMount(async () => {
    isNip07Available = await KeyManager.hasNip07();
  });

  // The pubkey of a key, with the seckey of an nsec, or undefined for a key that cannot be used.
  // nip19.decode takes an npub or nsec of any length. A pubkey is 32 bytes, and a secret key is a
  // number from 1 to one less than the curve order, which getPublicKey checks.
  const readKey = (key: string | undefined): { pubkey: string; seckey?: string } | undefined => {
    if (key === undefined) return undefined;

    try {
      const { type, data } = nip19.decode(key);
      if (typeof data !== 'string') return undefined;
      if (type === 'nsec') return { pubkey: getPublicKey(data), seckey: data };
      if (type === 'npub' && /^[0-9a-f]{64}$/.test(data)) return { pubkey: data };
    } catch {
      // Not NIP-19, or an nsec that is not a secret key.
    }
    return undefined;
  };

  $: login = readKey(key);

  // Set while the extension is asked for the key, to stop waiting for it.
  let keyLookup: AbortController | undefined = undefined;
  let nip07Failure: 'failed' | 'canceled' | undefined = undefined;

  const onLoginWithNip07 = async () => {
    if (keyLookup) return;
    const attempt = new AbortController();
    keyLookup = attempt;
    nip07Failure = undefined;
    try {
      // The key is checked before logging in, so a refused or invalid one changes nothing.
      const location = `/p/${nip19.npubEncode(await KeyManager.getNip07PublicKey(attempt.signal))}`;
      // Replaces a login with a key, which would otherwise be kept.
      KeyManager.logout();
      $nip07 = true;
      goto(location);
    } catch (e) {
      // A key that the extension gives after the wait stopped is dropped, so the login is left as
      // it was.
      if (e instanceof Nip07CanceledError) {
        nip07Failure = 'canceled';
      } else {
        console.error(e);
        nip07Failure = 'failed';
      }
    } finally {
      keyLookup = undefined;
    }
  };

  const onLoginWithKey = () => {
    if (browser && login) {
      keyLookup?.abort();
      // Replaces any login, such as a NIP-07 one whose extension refused, which would be used instead.
      KeyManager.logout();
      if (login.seckey !== undefined) $seckey = login.seckey;
      $pubkey = login.pubkey;

      goto(`/p/${nip19.npubEncode(login.pubkey)}`);
    }
  };

  // Leaving the page or logging in otherwise must not let a key that comes later log in.
  onDestroy(() => keyLookup?.abort());
</script>

<h2 class="text-2xl md:text-3xl font-heading-token">{$_('login-with-nip07')}</h2>

{#if isNip07Available === false}
  <Alert variant="warning">
    <p>
      {$_('alert.nip07-unavailable')}
      {$_('see-other')}
      <ExternalLink
        href="https://github.com/nostr-protocol/nips/blob/master/07.md#implementation"
        class="anchor"
      >
        {$_('nip07-implementations')}
      </ExternalLink>
      {$_('.')}
    </p>
  </Alert>
{/if}

{#if nip07Failure}
  <div role="alert">
    <Alert variant={nip07Failure === 'canceled' ? 'warning' : 'error'}>
      <p>
        {nip07Failure === 'canceled' ? $_('alert.nip07-canceled') : $_('alert.nip07-login-failed')}
      </p>
    </Alert>
  </div>
{/if}

<!-- Unlike disabled, aria-disabled keeps the focus on the button while the key is asked for. -->
<button
  type="submit"
  on:click={onLoginWithNip07}
  disabled={!isNip07Available}
  aria-disabled={keyLookup !== undefined}
  use:focusWhen={nip07Failure === 'canceled'}
  class="btn bg-surface-300 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
>
  {$_('login')}
</button>

<div aria-live="polite">
  {#if keyLookup}
    <Nip07Waiting live={false} on:cancel={() => keyLookup?.abort()} />
  {/if}
</div>

<h2 class="text-2xl md:text-3xl font-heading-token">{$_('login-with-key')}</h2>

<label class="label">
  {$_('key')} (npub | nsec)
  <input
    type="password"
    bind:value={key}
    required
    class="input"
    class:input-error={key !== undefined && !login}
  />
</label>

<button type="submit" on:click={onLoginWithKey} disabled={!login} class="btn bg-surface-300">
  {$_('login')}
</button>
