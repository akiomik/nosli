<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  import { clickOutside } from '$lib/actions/clickOutside';

  export let open = false;
  export let anchor: 'left' | 'center' | 'right' = 'right';

  const dispatch = createEventDispatcher();
  const handleClickOutside = () => dispatch('close');
</script>

{#if anchor === 'left'}
  <div
    use:clickOutside={handleClickOutside}
    class="card absolute w-auto whitespace-nowrap p-4"
    class:hidden={!open}
  >
    <slot />
  </div>
{:else if anchor === 'center'}
  <div
    use:clickOutside={handleClickOutside}
    class="card absolute w-auto whitespace-nowrap p-4 left-1/2 -translate-x-1/2"
    class:hidden={!open}
  >
    <slot />
  </div>
{:else}
  <div
    use:clickOutside={handleClickOutside}
    class="card absolute w-auto whitespace-nowrap p-4 right-0"
    class:hidden={!open}
  >
    <slot />
  </div>
{/if}
