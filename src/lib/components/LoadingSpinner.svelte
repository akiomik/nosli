<script lang="ts">
  type Size = 'sm' | 'md';
  export let size: Size = 'md';
</script>

<!-- The slot goes under the spinner, such as a way to stop waiting. -->
<div class="grid place-items-center" class:h-96={size === 'md'} class:h-48={size === 'sm'}>
  <div class="flex flex-col items-center gap-4">
    <div
      class="animate-spin h-12 w-12 border-4 border-primary-500 rounded-full border-t-transparent"
    ></div>
    <slot />
  </div>
</div>
