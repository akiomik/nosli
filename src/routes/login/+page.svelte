<script lang="ts">
  import { FontAwesomeIcon } from '@fortawesome/svelte-fontawesome';
  import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';
  import { onDestroy } from 'svelte';
  import { _ } from 'svelte-i18n';

  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import LoginForm from '$lib/components/LoginForm.svelte';
  import Alert from '$lib/components/Alert.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

  export let data: PageData;

  let active = true;
  onDestroy(() => {
    active = false;
  });

  // Goes to the profile page once the NIP-07 extension gives the key, unless the user has left or
  // the login has changed since.
  const goToProfile = async (profile: Promise<string | undefined> | undefined) => {
    const path = await profile;
    if (path && active && profile === data.profile) goto(path, { replaceState: true });
  };
  $: goToProfile(data.profile);

  $: title = `${$_('login')} | Nosli`;
  $: desc = $_('login-to-nosli');
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={desc} />
  <meta name="keywords" content="nosli,nostr,curated,list,posts,damus,snort" />
  <meta property="og:url" content="https://nosli.vercel.app/login" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={desc} />
</svelte:head>

{#await data.profile}
  <LoadingSpinner />
{:then path}
  {#if path}
    <LoadingSpinner />
  {:else}
    <h1 class="text-3xl md:text-5xl font-heading-token">{$_('login')}</h1>

    <Alert>
      <div slot="icon">
        <h2 class="flex items-center space-x-2 text-2xl md:text-3xl font-heading-token">
          <FontAwesomeIcon icon={faCircleInfo} />
        </h2>
      </div>

      <p>{$_('alert.nsec-and-nip07-info')}</p>
    </Alert>

    <LoginForm />
  {/if}
{/await}
