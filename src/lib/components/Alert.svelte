<script lang="ts">
  export let variant: '' | 'warning' | 'error' = '';

  let className = 'border-surface-500 bg-surface-200/30';
  switch (variant) {
    case 'warning':
      className = 'border-warning-500 bg-warning-200/30';
      break;
    case 'error':
      className = 'border-error-500 bg-error-200/30';
      break;
  }
</script>

<aside class={`flex items-center gap-3 rounded-lg border p-3 ${className}`}>
  <slot name="icon" />

  <div>
    <slot />
  </div>
</aside>
