<script lang="ts">
  import Settings from '$lib/components/Settings.svelte';
  import Popover from '$lib/components/Popover.svelte';

  export let open = false;
</script>

<Popover {open} on:close anchor="center">
  <Settings />
</Popover>
