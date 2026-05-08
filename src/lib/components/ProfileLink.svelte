<script lang="ts">
  import { base } from '$app/paths';
  import type Profile from '$lib/entities/Profile';
  import ExternalLink from '$lib/components/ExternalLink.svelte';
  import { externalProfileUrl } from '$lib/services/externalLink';
  import { linkTarget } from '$lib/stores/cookie';

  export let profile: Profile;
  export let local = false;

  let className = '';
  export { className as class };
</script>

{#if local}
  <a href="{base}/p/{profile.nip19Id()}" class={className}>
    <slot />
  </a>
{:else}
  <ExternalLink href={externalProfileUrl($linkTarget, profile.nip19Id())} class={className}>
    <slot />
  </ExternalLink>
{/if}
