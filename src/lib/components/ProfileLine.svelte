<script lang="ts">
  import { Avatar } from '@skeletonlabs/skeleton';
  import type Profile from '$lib/entities/Profile';

  export let profile: Profile | undefined;
</script>

<div class="flex flex-row items-center space-x-2">
  <Avatar
    src={profile?.safePicture()}
    initials="NO"
    alt="Profile picture of {profile?.formattedName() || 'nostrich'}"
    width="w-8"
  />
  <p>{profile?.formattedName() || 'nostrich'}</p>
</div>
