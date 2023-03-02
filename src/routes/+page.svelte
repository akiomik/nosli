<script lang="ts">
  import type { PageData } from './$types';
  import NostrClient from '$lib/services/NostrClient';
  import type LongFormContent from '$lib/entities/LongFormContent';
  import ExternalLink from '$lib/components/ExternalLink.svelte';
  import MatomeList from '$lib/components/MatomeList.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

  export let data: PageData & {
    matomes: LongFormContent[] | undefined;
    client: NostrClient | undefined;
  };

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

{#if data.matomes && data.client}
  <MatomeList matomes={data.matomes} client={data.client} />
{:else}
  <LoadingSpinner />
{/if}
