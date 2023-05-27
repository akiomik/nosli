<script lang="ts">
  import type { ConnectionStatePacket } from 'rx-nostr';

  import RelayConnectionStatusIcon from '$lib/components/RelayConnectionStatusIcon.svelte';

  export let connections: ConnectionStatePacket[];
</script>

<ul class="flex flex-col space-y-4">
  {#each connections as { state, from } (from)}
    <li class="flex space-x-2 items-center">
      <RelayConnectionStatusIcon status={state} />
      <p>{from}</p>
    </li>
  {/each}
</ul>
