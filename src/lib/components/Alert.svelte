<script lang="ts">
  export let variant = 'warning';

  $: className =
    variant === undefined || variant === '' ? 'variant-ghost' : `variant-ghost-${variant}`;
</script>

<div class="alert {className} my-8">
  <slot name="icon" />

  <div class="alert-message">
    <slot />
  </div>
</div>
