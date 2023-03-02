<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Avatar } from '@skeletonlabs/skeleton';
  import { browser } from '$app/environment';
  import type { PageData } from './$types';
  import type Profile from '$lib/entities/Profile';
  import type LongFormContent from '$lib/entities/LongFormContent';
  import type NostrClient from '$lib/services/NostrClient';
  import { NoteContentFormatter } from '$lib/services/NoteContentFormatter';
  import { pubkey, seckey } from '$lib/stores/cookie';
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
</script>

<svelte:head>
  <title>{data?.profile?.formattedName() || 'nostrich'} | Nosli</title>
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

{#if data?.profile?.pubkey === $pubkey && $seckey === ''}
  <Alert>
    <p>Due to you are logged in by npub, you can't post a matome</p>
  </Alert>
{/if}

<h2>Matomes</h2>

{#if data.matomes && data.client}
  <MatomeList matomes={data.matomes} client={data.client} />
{:else}
  <LoadingSpinner />
{/if}
