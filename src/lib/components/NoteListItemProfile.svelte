<script lang="ts">
  import { Avatar } from '@skeletonlabs/skeleton-svelte';
  import type Profile from '#lib/entities/Profile.js';
  import ProfileNip05 from '#lib/components/ProfileNip05.svelte';

  export let profile: Profile | undefined;
  $: name = profile?.formattedName() || 'nostrich';
</script>

<div class="flex items-center">
  <div class="mr-2">
    <Avatar class="size-12">
      <Avatar.Image src={profile?.safePicture()} alt={name} />
      <Avatar.Fallback>NO</Avatar.Fallback>
    </Avatar>
  </div>

  <div class="text-ellipsis overflow-hidden">
    <p class="font-bold wrap-anywhere">
      {name}
    </p>

    {#if profile}
      <ProfileNip05 {profile} />
    {/if}
  </div>
</div>
