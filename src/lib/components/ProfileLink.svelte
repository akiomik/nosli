<script lang="ts">
  import type Profile from '$lib/entities/Profile';
  import ExternalLink from '$lib/components/ExternalLink.svelte';

  export let profile: Profile;
  export let local = false;

  let className = '';
  export { className as class };
</script>

{#if local}
  <a href="/p/{profile.nip19Id()}" class={className}>
    <slot />
  </a>
{:else}
  <ExternalLink href="https://snort.social/p/{profile.nip19Id()}" class={className}>
    <slot />
  </ExternalLink>
{/if}
