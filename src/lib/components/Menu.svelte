<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import { _ } from 'svelte-i18n';

  import { goto } from '$app/navigation';
  import KeyManager from '$lib/services/KeyManager';
  import { loginMethod } from '$lib/stores/login';

  const dispatch = createEventDispatcher();

  // Looked up again for each login.
  $: pubkey = $loginMethod ? KeyManager.getPublicKey() : undefined;

  const logout = () => {
    dispatch('select', 'logout');
    KeyManager.logout();
    goto('/');
  };
</script>

<ul class="flex flex-col space-y-4">
  {#await pubkey}
    <!-- noop -->
  {:then pubkey}
    {#if pubkey}
      <li>
        <a
          href="/p/{nip19.npubEncode(pubkey)}"
          class="inline-block w-full text-left"
          on:click={() => dispatch('select', 'my-page')}>{$_('mypage')}</a
        >
      </li>
    {/if}
  {:catch}
    <!-- The NIP-07 extension is missing or refused the public key, so there is no page to link. -->
  {/await}
  <li>
    <button on:click={logout} class="w-full text-left">{$_('logout')}</button>
  </li>
</ul>
