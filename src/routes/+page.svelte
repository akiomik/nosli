<script lang="ts">
  import { _ } from 'svelte-i18n';

  import NostrClient from '#lib/services/NostrClient.js';
  import ExternalLink from '#lib/components/ExternalLink.svelte';
  import GlobalMatomeList from '#lib/components/GlobalMatomeList.svelte';

  $: title = $_('home.title');
  $: desc = $_('home.description');
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={desc} />
  <meta name="keywords" content="nosli,nostr,curated,list,posts,damus,snort" />
  <meta property="og:url" content="https://nosli.vercel.app" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={desc} />
</svelte:head>

<h1 class="text-3xl md:text-5xl font-heading-token">Nosli</h1>

<p>
  {$_('nosli-description')}
  (
  <ExternalLink href="https://nostr.com" class="anchor">
    {$_('about-nostr')}
  </ExternalLink>
  )
  {$_('.')}
</p>

<h2 class="text-2xl md:text-3xl font-heading-token">{$_('how-it-works')}</h2>

<div>
  <p>
    {$_('home.list-is')}
    <ExternalLink href="https://github.com/nostr-protocol/nips/blob/master/23.md" class="anchor">
      NIP-23 Long Form Content
    </ExternalLink>
    {$_('home.tagged-with')}
    <code class="code">"{NostrClient.TAG}"</code>{$_('home.list-is-end')}
  </p>
  <p>{$_('home.stored-in-relays')}</p>
</div>

<h2 class="text-2xl md:text-3xl font-heading-token">{$_('recent-lists')}</h2>

<GlobalMatomeList />
