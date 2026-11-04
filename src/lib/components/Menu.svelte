<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import { _ } from 'svelte-i18n';

  import { goto } from '$app/navigation';
  import KeyManager from '$lib/services/KeyManager';
  import { loginMethod, type LoginMethod } from '$lib/stores/login';
  import MenuProfile from '$lib/components/MenuProfile.svelte';

  const dispatch = createEventDispatcher();

  const loginMethodLabels: Record<LoginMethod, string> = {
    nip07: 'logged-in-with-nip07',
    nsec: 'logged-in-with-nsec',
    npub: 'logged-in-with-npub'
  };

  // Looked up again for each login.
  $: pubkey = $loginMethod ? KeyManager.getPublicKey() : undefined;

  const logout = () => {
    dispatch('select', 'logout');
    KeyManager.logout();
    goto('/');
  };
</script>

{#if $loginMethod}
  <div class="space-y-2">
    {#await pubkey then pubkey}
      {#if pubkey}
        <!-- The menu is as wide as its widest line, so a long name wraps instead of widening it. -->
        <div class="whitespace-normal">
          <MenuProfile {pubkey} />
        </div>
      {/if}
    {:catch}
      <!-- The NIP-07 extension is missing or refused the public key, so there is no profile. -->
    {/await}
    <p class="text-sm">{$_(loginMethodLabels[$loginMethod])}</p>
  </div>
  <hr class="my-4" />
{/if}

<ul class="flex flex-col space-y-4">
  {#await pubkey}
    <!-- noop -->
  {:then pubkey}
    {#if pubkey}
      <li>
        <a
          href="/p/{nip19.npubEncode(pubkey)}"
          class="inline-block w-full text-left"
          on:click={() => dispatch('select', 'my-page')}>{$_('mypage')}</a
        >
      </li>
    {/if}
  {:catch}
    <!-- The NIP-07 extension is missing or refused the public key, so there is no page to link. -->
  {/await}
  <li>
    <button on:click={logout} class="w-full text-left">{$_('logout')}</button>
  </li>
</ul>
