<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Avatar } from '@skeletonlabs/skeleton';
  import { browser } from '$app/environment';
  import type { PageData } from './$types';
  import type Profile from '$lib/entities/Profile';
  import type LongFormContent from '$lib/entities/LongFormContent';
  import type NostrClient from '$lib/services/NostrClient';
  import { NoteContentFormatter } from '$lib/services/NoteContentFormatter';
  import KeyManager from '$lib/services/KeyManager';
  import MatomeList from '$lib/components/MatomeList.svelte';
  import Alert from '$lib/components/Alert.svelte';
  import ProfileNip05 from '$lib/components/ProfileNip05.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

  export let data: PageData & {
    profile: Profile | undefined;
    matomes: LongFormContent[] | undefined;
    client: NostrClient | undefined;
  };

  onDestroy(async () => {
    if (browser && data?.client) {
      await data?.client.close();
    }
  });

  $: name = data?.profile?.formattedName() || 'nostrich';
</script>

<svelte:head>
  <title>{name} | Nosli</title>
  <meta name="description" content="View {name}'s profile and lists" />
  <meta property="og:url" content="https://nosli.vercel.app/p/{data.id}" />
  <meta property="og:title" content="{name} | Nosli" />
  <meta property="og:description" content="View {name}'s profile and lists" />
</svelte:head>

<div class="flex space-x-4 items-center">
  <Avatar
    src={data?.profile?.safePicture()}
    initials="NO"
    alt="Profile picture of {data.profile?.formattedName() || 'nostrich'}"
    class="w-12 h-12"
  />
  <div class="flex flex-col">
    <h1>{data?.profile?.formattedName() || 'nostrich'}</h1>
    {#if data?.profile}
      <ProfileNip05 profile={data.profile} />
    {/if}
  </div>
</div>

{#if data?.profile}
  <p>{@html NoteContentFormatter.format(data.profile.about)}</p>
{/if}

{#if data?.profile?.pubkey && KeyManager.isLoggedInWithPublicKey()}
  {#await KeyManager.isLoggedInAs(data?.profile?.pubkey)}
    <!-- noop -->
  {:then isLoggedIn}
    {#if isLoggedIn}
      <Alert>
        <p>You are logged in with npub and unable to create or edit a list.</p>
      </Alert>
    {/if}
  {/await}
{/if}

<h2>Lists</h2>

{#if data.matomes && data.client}
  <MatomeList matomes={data.matomes} client={data.client} />
{:else}
  <LoadingSpinner />
{/if}
