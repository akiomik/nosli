<script lang="ts">
  import { onMount } from 'svelte';
  import { nip19, getPublicKey } from 'nostr-tools';
  import type Profile from '$lib/entities/Profile';
  import NostrClient from '$lib/services/NostrClient';
  import { key } from '$lib/stores/cookie';
  import MatomeList from '$lib/components/MatomeList.svelte';

  let asyncProfile: Promise<Profile | undefined>;

  const client = new NostrClient(['wss://relay.damus.io', 'wss://relay.snort.social']);
  onMount(async () => {
    await client.connect();
    const pubkey = $key.startsWith('npub')
      ? nip19.decode($key).data
      : getPublicKey(nip19.decode($key).data);
    asyncProfile = client.getProfile(pubkey);
  });
</script>

{#await asyncProfile}
  <p>loading</p>
{:then profile}
  <p>Hello, {profile?.displayName || profile?.name || 'nostrich'}!</p>

  {#if $key.startsWith('nsec')}
    <a href="/matome/new">Create matome</a>
  {:else}
    <p>Due to you are logged in by npub, you can't post a matome</p>
  {/if}

  <MatomeList />
{/await}
