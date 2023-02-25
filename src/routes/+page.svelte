<script lang="ts">
  import Login from '$lib/components/Login.svelte';
  import MyPage from '$lib/components/MyPage.svelte';
  import { npub } from '$lib/stores/cookie.js';
</script>

{#if $npub === ''}
  <Login />
{:else}
  <MyPage />
{/if}
