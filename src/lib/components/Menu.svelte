<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import { _ } from 'svelte-i18n';

  import { goto } from '$app/navigation';
  import KeyManager from '#lib/services/KeyManager.js';
  import { loginMethod, type LoginMethod } from '#lib/stores/login.js';
  import MenuProfile from '#lib/components/MenuProfile.svelte';

  export let open = false;

  const dispatch = createEventDispatcher();

  const loginMethodLabels: Record<LoginMethod, string> = {
    nip07: 'logged-in-with-nip07',
    nsec: 'logged-in-with-nsec',
    npub: 'logged-in-with-npub'
  };

  // Looked up again for each login.
  $: pubkey = $loginMethod ? KeyManager.getPublicKey() : undefined;
  // The profile is loaded when the menu first opens, usually after the relays have connected, and then
  // kept.
  let opened = false;
  $: if (open) opened = true;

  const logout = () => {
    dispatch('select', 'logout');
    KeyManager.logout();
    goto('/');
  };
</script>

{#if $loginMethod}
  <!-- This width fits most names on one line, and a longer name wraps instead of widening the menu.
       On a narrow screen, it shrinks with the menu. -->
  <div class="w-56 max-w-full space-y-2">
    {#await pubkey then pubkey}
      {#if pubkey && opened}
        <MenuProfile {pubkey} />
      {/if}
    {:catch}
      <!-- The NIP-07 extension is missing or refused the public key, so there is no profile. -->
    {/await}
    <p class="text-sm">{$_(loginMethodLabels[$loginMethod])}</p>
  </div>
  <hr class="my-4" />
{/if}

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
