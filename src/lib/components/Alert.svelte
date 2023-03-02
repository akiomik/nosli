<script lang="ts">
  export let variant = '';

  $: className =
    variant === undefined || variant === '' ? 'variant-ghost' : `variant-ghost-${variant}`;
</script>

<aside class="alert {className}">
  <slot name="icon" />

  <div class="alert-message">
    <slot />
  </div>
</aside>
