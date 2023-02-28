<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Avatar } from '@skeletonlabs/skeleton';
  import { browser } from '$app/environment';
  import type { PageData } from './$types';
  import type Profile from '$lib/entities/Profile';
  import NostrClient from '$lib/services/NostrClient';
  import { NoteContentFormatter } from '$lib/services/NoteContentFormatter';
  import { pubkey, seckey } from '$lib/stores/cookie';
  import MatomeList from '$lib/components/MatomeList.svelte';
  import Alert from '$lib/components/Alert.svelte';
  import ProfileNip05 from '$lib/components/ProfileNip05.svelte';

  export let data: PageData & {
    profile: Profile | undefined;
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
  <Alert class="alert variant-ghost alert-message">
    <p>Due to you are logged in by npub, you can't post a matome</p>
  </Alert>
{/if}

<h2>Matomes</h2>

<MatomeList id={data.id} client={data.client} />
