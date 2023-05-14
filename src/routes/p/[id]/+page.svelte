<script lang="ts">
  import { onMount } from 'svelte';
  import { Avatar } from '@skeletonlabs/skeleton';
  import { browser } from '$app/environment';
  import type { PageData } from './$types';
  import Profile from '$lib/entities/Profile';
  import LongFormContent from '$lib/entities/LongFormContent';
  import type RxNostrClient from '$lib/services/RxNostrClient';
  import { NoteContentFormatter } from '$lib/services/NoteContentFormatter';
  import KeyManager from '$lib/services/KeyManager';
  import MatomeList from '$lib/components/MatomeList.svelte';
  import Alert from '$lib/components/Alert.svelte';
  import ProfileNip05 from '$lib/components/ProfileNip05.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

  export let data: PageData & {
    client: RxNostrClient | undefined;
    pubkey: string;
  };

  let matomes: LongFormContent[] | undefined = undefined;
  let profile: Profile | undefined = undefined;
  let profilesByPubkey: Record<string, Profile> = {};

  onMount(() => {
    if (browser && data.pubkey && data?.client) {
      data.client.observableProfile({ pubkey: data.pubkey }).subscribe((enveolope) => {
        profile = Profile.fromEvent(enveolope.event);
        profilesByPubkey[data.pubkey] = profile;
      });

      data.client.observableUserArticles({ pubkey: data.pubkey }).subscribe((enveolope) => {
        const matome = LongFormContent.fromEvent(enveolope.event);

        if (matomes === undefined) {
          matomes = [];
        }

        matomes = [...matomes, matome];
      });
    }
  });

  $: name = profile?.formattedName() || 'nostrich';
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
    src={profile?.safePicture()}
    initials="NO"
    alt="Profile picture of {profile?.formattedName() || 'nostrich'}"
    class="w-12 h-12"
  />
  <div class="flex flex-col">
    <h1>{profile?.formattedName() || 'nostrich'}</h1>
    {#if profile}
      <ProfileNip05 {profile} />
    {/if}
  </div>
</div>

{#if profile}
  <p>{@html NoteContentFormatter.format(profile.about)}</p>
{/if}

{#if profile?.pubkey && KeyManager.isLoggedInWithPublicKey()}
  {#await KeyManager.isLoggedInAs(profile?.pubkey)}
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

{#if matomes && data.client}
  <MatomeList {matomes} {profilesByPubkey} client={data.client} />
{:else}
  <LoadingSpinner />
{/if}
