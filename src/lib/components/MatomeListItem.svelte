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
    <div class="flex flex-row items-center mt-4 space-x-2">
      {#await asyncProfile}
        <p class="mt-4">nostrich</p>
      {:then profile}
        <Avatar
          src={profile?.safePicture()}
          initials="NO"
          alt="Profile picture of {profile?.formattedName() || 'nostrich'}"
          class="w-8 h-8"
        />
        <p>{profile?.formattedName() || 'nostrich'}</p>
      {/await}
      <p class="text-surface-900/50">
        {Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'medium' }).format(
          matome.createdAt
        )}
      </p>
    </div>
  </div>
</div>
