<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type Profile from '$lib/entities/Profile';
  import NostrClient from '$lib/services/NostrClient';
  import { pubkey, seckey } from '$lib/stores/cookie';
  import MatomeList from '$lib/components/MatomeList.svelte';

  // TODO: cache profile
  let profile: Profile | undefined;

  const client = new NostrClient(['wss://relay.damus.io', 'wss://relay.snort.social']);
  const onLogout = () => {
    $pubkey = '';
    $seckey = '';
  };

  onMount(async () => {
    await client.connect();
    profile = await client.getProfile($pubkey);
  });

  onDestroy(async () => {
    await client.close();
  });
</script>

<h1>My page</h1>

<p>Hello, {profile?.displayName || profile?.name || 'nostrich'}!</p>

<button class="btn bg-surface-300" on:click={onLogout}>Logout</button>

{#if $seckey !== ''}
  <a href="/matome/new" class="btn bg-primary-500">Create a new matome</a>
{:else}
  <p class="alert variant-ghost alert-message">
    Due to you are logged in by npub, you can't post a matome
  </p>
{/if}

<h2>My matomes</h2>

<MatomeList {client} />
