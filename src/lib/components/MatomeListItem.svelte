<script lang="ts">
  import { getContext } from 'svelte';
  import type { RxNostr } from 'rx-nostr';
  import { date } from 'svelte-i18n';
  import { profileStore } from '#lib/stores/nostr.js';
  import type LongFormContent from '#lib/entities/LongFormContent.js';
  import ProfileLine from '#lib/components/ProfileLine.svelte';

  export let matome: LongFormContent;

  const client: RxNostr = getContext('nostr-client');
  const profile = profileStore({ client, pubkey: matome.pubkey });
</script>

<div class="card">
  <div class="p-4">
    <h3 class="text-xl md:text-2xl font-heading-token wrap-anywhere">{matome.title}</h3>
    <p class="text-ellipsis overflow-hidden line-clamp-8 mt-4 wrap-anywhere">
      {matome.summary}
    </p>
    <!-- The date moves below a long name instead of squeezing it. -->
    <div class="flex flex-row flex-wrap items-center mt-4 gap-x-2 gap-y-1">
      <ProfileLine profile={$profile} />
      <p class="text-surface-900/50 whitespace-nowrap shrink-0">
        {$date(matome.createdAt, { dateStyle: 'medium', timeStyle: 'medium' })}
      </p>
    </div>
  </div>
</div>
