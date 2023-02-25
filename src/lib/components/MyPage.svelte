<script lang="ts">
  import { onMount } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import type Profile from '$lib/entities/Profile';
  import NostrClient from '$lib/services/NostrClient';
  import { npub } from '$lib/stores/cookie';
  import MatomeList from '$lib/components/MatomeList.svelte';

  let asyncProfile: Promise<Profile | undefined>;

  const client = new NostrClient(['wss://relay.damus.io', 'wss://relay.snort.social']);
  onMount(async () => {
    await client.connect();
    asyncProfile = client.getProfile(nip19.decode($npub).data);
  });
</script>

{#await asyncProfile}
  <p>loading</p>
{:then profile}
  <p>Hello, {profile?.displayName || profile?.name || 'nostrich'}!</p>

  <MatomeList />
{/await}
