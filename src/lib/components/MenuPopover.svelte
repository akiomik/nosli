<script lang="ts">
  import Menu from '$lib/components/Menu.svelte';
  import Popover from '$lib/components/Popover.svelte';

  export let open = false;
</script>

<Popover {open} on:close>
  <Menu />
</Popover>
