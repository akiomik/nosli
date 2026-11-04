<script lang="ts">
  import { getContext } from 'svelte';
  import type { RxNostr } from 'rx-nostr';

  import { profileStore } from '$lib/stores/nostr';
  import ProfileLine from '$lib/components/ProfileLine.svelte';

  export let pubkey: string;

  const client: RxNostr = getContext('nostr-client');
  $: profile = profileStore({ client, pubkey });
</script>

<ProfileLine profile={$profile} />
