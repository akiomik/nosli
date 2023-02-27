<script lang="ts">
  import Login from '$lib/components/Login.svelte';
  import MyPage from '$lib/components/MyPage.svelte';
  import { pubkey, seckey } from '$lib/stores/cookie.js';
</script>

{#if $pubkey === '' && $seckey === ''}
  <Login />
{:else}
  <MyPage />
{/if}
