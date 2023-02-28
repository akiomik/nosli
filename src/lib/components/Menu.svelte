<script lang="ts">
  import { nip19 } from 'nostr-tools';
  import { pubkey, seckey } from '$lib/stores/cookie';

  export let show = false;

  const logout = () => {
    $pubkey = '';
    $seckey = '';
  };

  $: isLoggedIn = $pubkey !== '' && $seckey !== '';
</script>

<nav class="card absolute w-48 p-4 right-0" class:hidden={!show}>
  <ul class="flex flex-col space-y-4">
    <li>
      <a href="/p/{nip19.npubEncode($pubkey)}" class="inline-block w-full text-left">My page</a>
    </li>
    <li>
      <button on:click={logout} class="w-full text-left">Logout</button>
    </li>
  </ul>
</nav>
