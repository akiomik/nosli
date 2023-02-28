<script lang="ts">
  import Login from '$lib/components/Login.svelte';
  import MyPage from '$lib/components/MyPage.svelte';
  import { pubkey, seckey } from '$lib/stores/cookie.js';

  $: loggedIn = $pubkey !== '' || $seckey !== '';
</script>

{#if loggedIn}
  <MyPage />
{:else}
  <Login />
{/if}
