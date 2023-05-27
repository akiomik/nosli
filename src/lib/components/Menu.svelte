<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import { _ } from 'svelte-i18n';

  import { goto } from '$app/navigation';
  import KeyManager from '$lib/services/KeyManager';

  export let show = false;

  const dispatch = createEventDispatcher();

  const logout = () => {
    dispatch('select', 'logout');
    KeyManager.logout();
    goto('/');
  };
</script>

<nav class="card absolute w-48 p-4 right-0" class:hidden={!show}>
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
      <button on:click={logout} class="w-full text-left">{$_('logout')}</button>
    </li>
  </ul>
</nav>
