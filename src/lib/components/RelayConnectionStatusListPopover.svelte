<script lang="ts">
  import type { ConnectionStatePacket } from 'rx-nostr';

  import RelayConnectionStatusList from '$lib/components/RelayConnectionStatusList.svelte';
  import Popover from '$lib/components/Popover.svelte';

  export let open = false;
  export let connections: ConnectionStatePacket[];
</script>

<Popover {open} on:close anchor="left">
  <RelayConnectionStatusList {connections} />
</Popover>
