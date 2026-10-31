<script lang="ts">
  import { Avatar } from '@skeletonlabs/skeleton-svelte';
  import type Profile from '$lib/entities/Profile';
  import ProfileNip05 from '$lib/components/ProfileNip05.svelte';

  export let profile: Profile | undefined;
  const name = profile?.displayName || profile?.name || profile?.pubkey || 'nostrich';
</script>

<div class="flex items-center">
  <div class="mr-2">
    <Avatar src={profile?.safePicture()} {name} size="size-12">NO</Avatar>
  </div>

  <div class="text-ellipsis overflow-hidden">
    <p class="font-bold text-ellipsis overflow-hidden">
      {name}
    </p>

    {#if profile}
      <ProfileNip05 {profile} />
    {/if}
  </div>
</div>
