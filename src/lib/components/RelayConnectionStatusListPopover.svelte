<script lang="ts">
  import RelayConnectionStatusList from '$lib/components/RelayConnectionStatusList.svelte';
  import Popover from '$lib/components/Popover.svelte';

  export let open = false;
</script>

<Popover {open} on:close anchor="left">
  <RelayConnectionStatusList />
</Popover>
