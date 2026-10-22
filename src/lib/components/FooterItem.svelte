<script lang="ts">
  export let last = false;

  const className = last
    ? 'inline'
    : "inline after:content-['・'] after:text-surface-300 dark:after:text-surface-600 after:ml-1";
</script>

<li class={className}>
  <slot />
</li>
