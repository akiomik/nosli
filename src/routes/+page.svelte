<script lang="ts">
  import NostrClient from '$lib/services/NostrClient';
  import ExternalLink from '$lib/components/ExternalLink.svelte';
  import GlobalMatomeList from '$lib/components/GlobalMatomeList.svelte';

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

<h2>How it works</h2>

<div>
  <p>
    A curated list is simply
    <ExternalLink href="https://github.com/nostr-protocol/nips/blob/master/23.md">
      NIP-23 Long Form Content
    </ExternalLink>
    tagged with
    <code>"{NostrClient.TAG}"</code>.
  </p>
  <p>It is stored in relays and can be viewed and edited by other NIP-23 supported clients.</p>
</div>

<h2>Global lists</h2>

<GlobalMatomeList />
