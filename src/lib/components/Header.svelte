<script lang="ts">
  import { FontAwesomeIcon } from '@fortawesome/svelte-fontawesome';
  import { faBars } from '@fortawesome/free-solid-svg-icons';
  import { AppBar } from '@skeletonlabs/skeleton';
  import { pubkey, seckey } from '$lib/stores/cookie';
  import Menu from '$lib/components/Menu.svelte';

  let showMenu = false;

  const handleMenu = () => {
    showMenu = !showMenu;
  };

  $: isLoggedIn = $pubkey !== '' && $seckey !== '';
</script>

<AppBar>
  <svelte:fragment slot="lead">
    <a href="/">
      <span class="flex items-center">
        <img src="/favicon.svg" alt="Nosli icon" class="h-10 mr-1" width="40" height="40" />
        Nosli
      </span>
    </a>
  </svelte:fragment>
  <svelte:fragment slot="trail">
    {#if isLoggedIn}
      <a href="/matome/new" class="btn bg-primary-500">Create</a>
      <div class="relative">
        <button class="btn-icon hover:variant-soft-surface" on:click={handleMenu}>
          <FontAwesomeIcon icon={faBars} title="Open menu" />
        </button>
        <Menu show={showMenu} />
      </div>
    {:else}
      <a href="/login" class="btn bg-primary-500">Login</a>
    {/if}
  </svelte:fragment>
</AppBar>
