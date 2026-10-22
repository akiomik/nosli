<script lang="ts">
  import { Avatar } from '@skeletonlabs/skeleton-svelte';
  import type Profile from '$lib/entities/Profile';

  export let profile: Profile | undefined;
</script>

<div class="flex flex-row items-center space-x-2">
  <Avatar class="size-8">
    <Avatar.Image src={profile?.safePicture()} alt={profile?.formattedName() || 'nostrich'} />
    <Avatar.Fallback>NO</Avatar.Fallback>
  </Avatar>
  <p>{profile?.formattedName() || 'nostrich'}</p>
</div>
