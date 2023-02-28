<script lang="ts">
  import ExternalLink from '$lib/components/ExternalLink.svelte';

  const title = 'Nosli | Create curated lists of posts on nostr';
  const desc = 'Nosli helps you create a curated list of posts on nostr';
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={desc} />
  <meta name="keywords" content="nosli,nostr,curated,list,posts,damus,snort" />
  <meta property="og:url" content="https://nosli.vercel.app" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={desc} />
</svelte:head>

<h1>Nosli</h1>

<p>
  Nosli helps you create a curated list of posts on
  <ExternalLink href="https://nostr.com">nostr</ExternalLink>.
</p>

<!-- TODO: list matomes -->
