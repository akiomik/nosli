<script lang="ts">
  import { getContext } from 'svelte';
  import type { RxNostr } from 'rx-nostr';
  import { Avatar } from '@skeletonlabs/skeleton-svelte';
  import { _ } from 'svelte-i18n';

  import type { PageData } from './$types';
  import { recentUserMatomesStore, profileStore } from '$lib/stores/nostr';
  import { linkify, linkifyOpts } from '$lib/actions/linkify';
  import KeyManager from '$lib/services/KeyManager';
  import MatomeList from '$lib/components/MatomeList.svelte';
  import Alert from '$lib/components/Alert.svelte';
  import ProfileNip05 from '$lib/components/ProfileNip05.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

  export let data: PageData & {
    pubkey: string;
  };

  const client: RxNostr = getContext('nostr-client');
  const matomes = recentUserMatomesStore({ client, pubkey: data.pubkey });
  const profile = profileStore({ client, pubkey: data.pubkey });

  $: name = $profile?.formattedName() || 'nostrich';
</script>

<svelte:head>
  <title>{name} | Nosli</title>
  <meta name="description" content="View {name}'s profile and lists" />
  <meta property="og:url" content="https://nosli.vercel.app/p/{data.pubkey}" />
  <meta property="og:title" content="{name} | Nosli" />
  <meta property="og:description" content="View {name}'s profile and lists" />
</svelte:head>

<div class="flex space-x-4 items-center">
  <Avatar
    src={$profile?.safePicture()}
    name={$profile?.formattedName() || 'nostrich'}
    size="size-12">NO</Avatar
  >
  <div class="flex flex-col">
    <h1 class="text-5xl font-heading-token">{$profile?.formattedName() || 'nostrich'}</h1>
    {#if $profile}
      <ProfileNip05 profile={$profile} />
    {/if}
  </div>
</div>

{#if $profile}
  <p use:linkify={linkifyOpts}>{$profile.about}</p>
{/if}

{#if $profile && KeyManager.isLoggedInWithPublicKey()}
  {#await KeyManager.isLoggedInAs($profile.pubkey)}
    <!-- noop -->
  {:then isLoggedIn}
    {#if isLoggedIn}
      <Alert>
        <p>{$_('alert.npub-limitation')}</p>
      </Alert>
    {/if}
  {/await}
{/if}

<h2 class="text-3xl font-heading-token">{$_('created-lists')}</h2>

{#if $matomes}
  <MatomeList matomes={$matomes} />
{:else}
  <LoadingSpinner />
{/if}
