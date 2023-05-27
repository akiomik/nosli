<script lang="ts">
  import { getContext } from 'svelte';
  import type { RxNostr } from 'rx-nostr';

  import { latestConnectionState } from '$lib/stores/operators';
  import RelayConnectionStatusIcon from '$lib/components/RelayConnectionStatusIcon.svelte';

  const client: RxNostr = getContext('nostr-client');
  const connections = client.createConnectionStateObservable()?.pipe(latestConnectionState());

  $: statusByUrl = Object.fromEntries($connections?.map((conn) => [conn.from, conn.state]) ?? []);
</script>

<ul class="flex flex-col space-y-4">
  {#each client.getRelays() as relay (relay.url)}
    <li class="flex space-x-2 items-center">
      <RelayConnectionStatusIcon status={statusByUrl[relay.url] || 'not-started'} />
      <p>{relay.url}</p>
    </li>
  {/each}
</ul>
