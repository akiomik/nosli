<script lang="ts">
  import Login from '$lib/components/Login.svelte';
  import MyPage from '$lib/components/MyPage.svelte';
  import { key } from '$lib/stores/cookie.js';
</script>

{#if $key === ''}
  <Login />
{:else}
  <MyPage />
{/if}
