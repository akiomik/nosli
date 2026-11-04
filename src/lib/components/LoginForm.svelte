<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/env';
  import { goto } from '$app/navigation';
  import { nip19 } from 'nostr-tools';
  import { _ } from 'svelte-i18n';

  import { focusWhen } from '#lib/actions/focusWhen.js';
  import { pubkey, seckey, nip07 } from '#lib/stores/cookie.js';
  import KeyManager, { Nip07CanceledError } from '#lib/services/KeyManager.js';
  import { readLoginKey } from '#lib/services/loginKey.js';
  import Alert from '#lib/components/Alert.svelte';
  import ExternalLink from '#lib/components/ExternalLink.svelte';
  import Nip07Waiting from '#lib/components/Nip07Waiting.svelte';

  let key: string | undefined = undefined; // TODO: support NIP-07

  // Undefined while an extension that is still loading is waited for.
  let isNip07Available: boolean | undefined = undefined;
  onMount(async () => {
    isNip07Available = await KeyManager.hasNip07();
  });

  $: login = readLoginKey(key);

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
      // Dropped without a word once the user has logged in otherwise or left.
      if (keyLookup !== attempt) return;
      // A key that the extension gives after the wait stopped is dropped, so the login is left as
      // it was.
      if (e instanceof Nip07CanceledError) {
        nip07Failure = 'canceled';
      } else {
        console.error(e);
        nip07Failure = 'failed';
      }
    } finally {
      if (keyLookup === attempt) keyLookup = undefined;
    }
  };

  // Logging in otherwise or leaving the page must not let a key that comes later log in.
  const dropNip07Login = () => {
    const lookup = keyLookup;
    keyLookup = undefined;
    lookup?.abort();
  };

  const onLoginWithKey = () => {
    if (browser && login) {
      dropNip07Login();
      // Replaces any login, such as a NIP-07 one whose extension refused, which would be used instead.
      KeyManager.logout();
      if (login.seckey !== undefined) $seckey = login.seckey;
      $pubkey = login.pubkey;

      goto(`/p/${nip19.npubEncode(login.pubkey)}`);
    }
  };

  onDestroy(dropNip07Login);
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
