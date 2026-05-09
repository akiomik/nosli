<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import { _ } from 'svelte-i18n';

  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import KeyManager from '$lib/services/KeyManager';
  import { pubkey, nip07 } from '$lib/stores/cookie';

  const dispatch = createEventDispatcher();

  $: loggedIn = $pubkey || $nip07 ? KeyManager.isLoggedIn() : false;

  const logout = () => {
    dispatch('select', 'logout');
    KeyManager.logout();
    goto(`${base}/`);
  };

  const openSettings = () => {
    dispatch('select', 'settings');
  };
</script>

<ul class="flex flex-col space-y-4">
  {#if loggedIn}
    {#await KeyManager.getPublicKey()}
      <!-- noop -->
    {:then pk}
      <li>
        <a
          href="{base}/p/{nip19.npubEncode(pk)}"
          class="inline-block w-full text-left"
          on:click={() => dispatch('select', 'my-page')}>{$_('mypage')}</a
        >
      </li>
    {/await}
  {/if}
  <li>
    <button on:click|stopPropagation={openSettings} class="w-full text-left">
      {$_('settings.title')}
    </button>
  </li>
  {#if loggedIn}
    <li>
      <button on:click={logout} class="w-full text-left">{$_('logout')}</button>
    </li>
  {/if}
</ul>
