<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import { pubkey, seckey } from '$lib/stores/cookie';

  export let show = false;

  const dispatch = createEventDispatcher();

  const logout = () => {
    dispatch('select', 'logout');
    $pubkey = '';
    $seckey = '';
  };

  $: isLoggedIn = $pubkey !== '' && $seckey !== '';
</script>

<nav class="card absolute w-48 p-4 right-0" class:hidden={!show}>
  <ul class="flex flex-col space-y-4">
    <li>
      <a
        href="/p/{nip19.npubEncode($pubkey)}"
        class="inline-block w-full text-left"
        on:click={() => dispatch('select', 'my-page')}>My page</a
      >
    </li>
    <li>
      <button on:click={logout} class="w-full text-left">Logout</button>
    </li>
  </ul>
</nav>
