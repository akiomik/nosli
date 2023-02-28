<script lang="ts">
  import type LongFormContent from '$lib/entities/LongFormContent';
  import type Profile from '$lib/entities/Profile';
  import ProfileLine from '$lib/components/ProfileLine.svelte';

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
        <p>nostrich</p>
      {:then profile}
        <ProfileLine {profile} />
      {/await}
      <p class="text-surface-900/50">
        {Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'medium' }).format(
          matome.createdAt
        )}
      </p>
    </div>
  </div>
</div>
