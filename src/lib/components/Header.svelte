<script lang="ts">
  import { FontAwesomeIcon } from '@fortawesome/svelte-fontawesome';
  import { faBars } from '@fortawesome/free-solid-svg-icons';
  import { AppBar } from '@skeletonlabs/skeleton';
  import { clickOutside } from '$lib/actions/clickOutside';
  import KeyManager from '$lib/services/KeyManager';
  import Menu from '$lib/components/Menu.svelte';

  let showMenu = false;

  const handleMenu = (e: MouseEvent) => {
    showMenu = !showMenu;
    e.stopPropagation();
  };

  const onMenuSelect = () => {
    showMenu = false;
  };
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
    {#if KeyManager.isLoggedIn()}
      {#if KeyManager.isLoggedInWithNip07() || KeyManager.isLoggedInWithSecretKey()}
        <a href="/li/new" class="btn bg-primary-500">Create</a>
      {/if}

      <div class="relative">
        <button class="btn-icon hover:variant-soft-surface" on:click={handleMenu}>
          <FontAwesomeIcon icon={faBars} title="Open menu" />
        </button>
        <div use:clickOutside={() => (showMenu = false)}>
          <Menu show={showMenu} on:select={onMenuSelect} />
        </div>
      </div>
    {:else}
      <a href="/login" class="btn bg-primary-500">Login</a>
    {/if}
  </svelte:fragment>
</AppBar>
