<script lang="ts">
  import { focusWhen } from '#lib/actions/focusWhen.js';

  export let href: string;
  let className = '';
  export { className as class };
  // Whether the link takes the focus, as it should when it replaces the button that the user pressed.
  export let focus = false;
</script>

<a {href} rel="external noreferrer" target="_blank" class={className} use:focusWhen={focus}>
  <slot />
</a>
