<script lang="ts">
  type Size = 'sm' | 'md';
  export let size: Size = 'md';
</script>

<div class="grid place-items-center" class:h-96={size === 'md'} class:h-48={size === 'sm'}>
  <div
    class="animate-spin h-12 w-12 border-4 border-primary-500 rounded-full border-t-transparent"
  />
</div>
