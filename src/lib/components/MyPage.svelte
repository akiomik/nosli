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

    // debug
    const note = await client.getNote(
      'f97eff764be2b8787b327c6cfd7631405601652591f8bb412adc838496f23cd7'
    );
    console.log(note);
    const lfc = await client.get([
      {
        kinds: [30023],
        authors: ['c5fb6ecc876e0458e3eca9918e370cbcd376901c58460512fe537a46e58c38bb'],
        '#d': ['nosbin-early-days']
      }
    ]);
    console.log(lfc);
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

<MatomeList />
