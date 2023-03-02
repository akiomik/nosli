<script lang="ts">
  export let variant = '';
</script>

<aside class={variant === '' ? 'alert variant-ghost' : `alert variant-ghost-${variant}`}>
  <slot name="icon" />

  <div class="alert-message">
    <slot />
  </div>
</aside>
