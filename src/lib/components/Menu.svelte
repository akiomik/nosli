<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import { _ } from 'svelte-i18n';

  import { goto } from '$app/navigation';
  import KeyManager from '$lib/services/KeyManager';
  import { darkMode } from '$lib/stores/cookie';

  const dispatch = createEventDispatcher();

  const logout = () => {
    dispatch('select', 'logout');
    KeyManager.logout();
    goto('/');
  };

  const toggleDarkMode = () => {
    dispatch('select', 'dark-mode');
    $darkMode = !$darkMode;
  };
</script>

<ul class="flex flex-col space-y-4">
  {#await KeyManager.getPublicKey()}
    <!-- noop -->
  {:then pubkey}
    <li>
      <a
        href="/p/{nip19.npubEncode(pubkey)}"
        class="inline-block w-full text-left"
        on:click={() => dispatch('select', 'my-page')}>{$_('mypage')}</a
      >
    </li>
  {/await}
  <li>
    <button on:click={toggleDarkMode} class="w-full text-left">
      {$darkMode ? $_('light-mode') : $_('dark-mode')}
    </button>
  </li>
  <li>
    <button on:click={logout} class="w-full text-left">{$_('logout')}</button>
  </li>
</ul>
