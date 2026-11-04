<script lang="ts">
  import { Avatar } from '@skeletonlabs/skeleton-svelte';
  import type Profile from '$lib/entities/Profile';

  export let profile: Profile | undefined;
</script>

<div class="flex flex-row items-center space-x-2">
  <Avatar src={profile?.safePicture()} name={profile?.formattedName() || 'nostrich'} size="size-8"
    >NO</Avatar
  >
  <p>{profile?.formattedName() || 'nostrich'}</p>
</div>
