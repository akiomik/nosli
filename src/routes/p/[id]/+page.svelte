<script lang="ts">
  import { getContext } from 'svelte';
  import type { RxNostr } from 'rx-nostr';
  import { Avatar } from '@skeletonlabs/skeleton-svelte';
  import { _ } from 'svelte-i18n';

  import type { PageData } from './$types';
  import { recentUserMatomesStore, profileStore } from '#lib/stores/nostr.js';
  import { startWith } from 'rxjs';
  import { retries, retryable, withEnd } from '#lib/stores/missing.js';
  import { linkify, linkifyOpts } from '#lib/actions/linkify.js';
  import KeyManager from '#lib/services/KeyManager.js';
  import { loginMethod } from '#lib/stores/login.js';
  import MatomeList from '#lib/components/MatomeList.svelte';
  import Alert from '#lib/components/Alert.svelte';
  import ProfileNip05 from '#lib/components/ProfileNip05.svelte';
  import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';

  export let data: PageData & {
    pubkey: string;
  };

  const client: RxNostr = getContext('nostr-client');
  // A retry asks for the profile again too, since it went to the same relays. Both are asked for
  // again when the page moves to another profile, and the profile then starts from none.
  const pageRetries = retries(client);
  $: matomes = retryable(
    () => recentUserMatomesStore({ client, pubkey: data.pubkey }).pipe(withEnd(client)),
    pageRetries
  );
  // Why there are none, once the request has ended.
  $: missing = $matomes?.ended && $matomes.value.length === 0 ? $matomes.reason : undefined;
  $: profile = pageRetries
    .again(() => profileStore({ client, pubkey: data.pubkey }))
    .pipe(startWith(undefined));
  let retried = false;
  const retry = () => {
    retried = true;
    matomes.retry();
  };
  // A retry on the previous profile does not move the focus on this one.
  $: if (matomes) retried = false;

  $: name = $profile?.formattedName() || 'nostrich';
  $: desc = $_('profile-description', { values: { name } });
</script>

<svelte:head>
  <title>{name} | Nosli</title>
  <meta name="description" content={desc} />
  <meta property="og:url" content="https://nosli.vercel.app/p/{data.pubkey}" />
  <meta property="og:title" content="{name} | Nosli" />
  <meta property="og:description" content={desc} />
</svelte:head>

<div class="flex space-x-4 items-center">
  <Avatar class="size-12 shrink-0">
    <Avatar.Image src={$profile?.safePicture()} alt={$profile?.formattedName() || 'nostrich'} />
    <Avatar.Fallback>NO</Avatar.Fallback>
  </Avatar>
  <div class="flex flex-col min-w-0">
    <h1 class="text-3xl md:text-5xl font-heading-token wrap-anywhere">
      {$profile?.formattedName() || 'nostrich'}
    </h1>
    {#if $profile}
      <ProfileNip05 profile={$profile} />
    {/if}
  </div>
</div>

{#if $profile}
  <p class="wrap-anywhere" use:linkify={linkifyOpts}>{$profile.about}</p>
{/if}

{#if $profile && $loginMethod === 'npub'}
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

<h2 class="text-2xl md:text-3xl font-heading-token">{$_('created-lists')}</h2>

{#if $matomes && ($matomes.ended || $matomes.value.length > 0)}
  <MatomeList matomes={$matomes.value} {missing} focus={retried} on:retry={retry} />
{:else}
  <LoadingSpinner />
{/if}
