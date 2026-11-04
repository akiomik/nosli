<script lang="ts">
  import { Avatar } from '@skeletonlabs/skeleton-svelte';
  import type Profile from '$lib/entities/Profile';

  export let profile: Profile | undefined;
</script>

<div class="flex flex-row items-center space-x-2 min-w-0">
  <Avatar class="size-8 shrink-0">
    <Avatar.Image src={profile?.safePicture()} alt={profile?.formattedName() || 'nostrich'} />
    <Avatar.Fallback>NO</Avatar.Fallback>
  </Avatar>
  <p class="min-w-0 wrap-anywhere">{profile?.formattedName() || 'nostrich'}</p>
</div>
