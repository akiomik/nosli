<script lang="ts">
  export let variant: '' | 'warning' | 'error' = '';

  // NOTE: Dynamic class name does not seem to work
  let className = 'variant-ghost';
  switch (variant) {
    case 'warning':
      className = 'variant-ghost-warning';
      break;
    case 'error':
      className = 'variant-ghost-error';
      break;
  }
</script>

<aside class={`alert ${className}`}>
  <slot name="icon" />

  <div class="alert-message">
    <slot />
  </div>
</aside>
