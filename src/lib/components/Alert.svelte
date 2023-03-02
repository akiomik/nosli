<script lang="ts">
  export let variant = '';

  $: className = variant === '' ? 'variant-ghost' : `variant-ghost-${variant}`;
  // $: className = 'variant-ghost';
</script>

<!-- FIXME: This does not seems to work -->
<!-- <aside class="alert {className}"> -->
<aside class="alert variant-ghost">
  <slot name="icon" />

  <div class="alert-message">
    <slot />
  </div>
</aside>
