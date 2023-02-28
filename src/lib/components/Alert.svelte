<script lang="ts">
  export let variant = 'warning';
</script>

<div class="alert variant-ghost-{variant} my-8">
  <div class="alert-message">
    <slot />
  </div>
</div>
