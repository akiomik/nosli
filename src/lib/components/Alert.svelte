<script lang="ts">
  // FIXME: Doesn't seem to work
  export let variant: string | undefined = 'warning';

  $: className =
    variant === undefined || variant === '' ? 'variant-ghost' : `variant-ghost-${variant}`;
</script>

<aside class="alert {className}">
  <slot name="icon" />

  <div class="alert-message">
    <slot />
  </div>
</aside>
