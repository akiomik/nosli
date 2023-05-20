<script lang="ts">
  import { getContext } from 'svelte';
  import type RxNostr from 'rx-nostr';
  import { profileStore } from '$lib/stores/nostr';
  import type LongFormContent from '$lib/entities/LongFormContent';
  import ProfileLine from '$lib/components/ProfileLine.svelte';

  export let matome: LongFormContent;

  const client: RxNostr = getContext('nostr-client');
  const profile = profileStore({ client, pubkey: matome.pubkey });
</script>

<div class="card">
  <div class="p-4">
    <h3>{matome.title}</h3>
    <p class="text-ellipsis overflow-hidden line-clamp-8 mt-4">
      {matome.summary}
    </p>
    <div class="flex flex-row items-center mt-4 space-x-2">
      <ProfileLine profile={$profile} />
      <p class="text-surface-900/50 whitespace-nowrap overflow-hidden text-ellipsis">
        {Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'medium' }).format(
          matome.createdAt
        )}
      </p>
    </div>
  </div>
</div>
