<script lang="ts">
  import type Profile from '$lib/entities/Profile';
  import ExternalLink from '$lib/components/ExternalLink.svelte';

  export let profile: Profile;
  let className = '';
  export { className as class };

  $: href = `https://snort.social/p/${profile.nip19Id()}`;
</script>

<ExternalLink {href} class={className}>
  <slot />
</ExternalLink>
