<script lang="ts">
  import { Avatar } from '@skeletonlabs/skeleton';
  import type LongFormContent from '$lib/entities/LongFormContent';
  import type Profile from '$lib/entities/Profile';

  export let matome: LongFormContent;
  export let asyncProfile: Promise<Profile | undefined>;
</script>

<div class="card">
  <div class="p-4">
    <h3>{matome.title}</h3>
    <p class="text-ellipsis overflow-hidden line-clamp-8 mt-4">
      {matome.summary}
    </p>
    {#await asyncProfile}
      <p class="mt-4">nostrich</p>
    {:then profile}
      <div class="flex flex-row items-center mt-4">
        <Avatar
          src={profile?.safePicture()}
          initials="NO"
          alt="Profile picture of {profile?.formattedName() || 'nostrich'}"
          class="w-8 h-8 mr-2"
        />
        <p>{profile?.formattedName() || 'nostrich'}</p>
      </div>
    {/await}
  </div>
</div>
