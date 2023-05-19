<script lang="ts">
  import { goto } from '$app/navigation';
  import { nip19 } from 'nostr-tools';
  import { onDestroy } from 'svelte';
  import { TabGroup, Tab } from '@skeletonlabs/skeleton';

  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import Editor from '$lib/components/NoteEditor/Editor.svelte';
  import RecentReactionList from '$lib/components/NoteEditor/RecentReactionList.svelte';
  import LongFormContent from '$lib/entities/LongFormContent';
  import Tag from '$lib/entities/Tag';
  import NostrClient from '$lib/services/NostrClient';
  import type RxNostrClient from '$lib/services/RxNostrClient';
  import * as settings from '$lib/services/settings';
  import { createNoteEditorStore } from '$lib/stores/noteEditor';

  export let matome: LongFormContent | undefined = undefined;
  export let rxClient: RxNostrClient;

  const client = new NostrClient(settings.defaultRelays);
  const editor = createNoteEditorStore({ matome, client: rxClient });

  let title: string | undefined = matome?.title;
  let summary: string | undefined = matome?.summary;
  let identifier: string | undefined = matome?.identifier || `nosli-${new Date().getTime()}`;
  let tabActive = 0;

  $: isIdentifierValid =
    identifier !== undefined && identifier.length > 0 && identifier.length <= 40;
  $: isTitleValid = title !== undefined && title.length > 0 && title.length <= 150;
  $: isSummaryValid = summary === undefined || summary.length <= 300;

  const onCreate = async () => {
    if (identifier === undefined || title === undefined || $editor.notes.length <= 0) {
      throw new Error('Unexpected error: identifier or title is undefined');
    }

    await client.connect();

    const lfcContent = $editor.notes.map((_, i) => `#[${i + 3}]`).join('\n');
    const tags = [
      ...$editor.notes.map(({ noteId }) => {
        return new Tag('e', noteId, '', 'mention');
      }),
      new Tag('t', 'nosli')
    ];
    let lfc = new LongFormContent(
      undefined,
      identifier,
      '',
      lfcContent,
      new Date(),
      title,
      summary || '',
      undefined,
      undefined,
      tags
    );

    lfc = await client.postLongFormContent(lfc);

    goto(`/li/${lfc.nip19Id()}`);
  };

  const onCancel = () => {
    if (confirm('Quit editing?')) {
      const path = matome ? `/li/${matome.nip19Id()}` : '/';
      goto(path);
    }
  };

  const onDelete = async () => {
    if (matome?.id && confirm('Are you sure you want to delete this list?')) {
      await client.deleteEvent(matome.id);

      goto(`/p/${nip19.npubEncode(matome.pubkey)}`);
    }
  };

  onDestroy(async () => {
    await client.close();
  });
</script>

<form class="flex flex-col space-y-6" novalidate>
  <label class="label">
    Identifier (required, cannot be changed after creation)
    <input
      type="text"
      bind:value={identifier}
      required
      class="input"
      class:input-error={identifier !== undefined && !isIdentifierValid}
      maxlength="40"
      disabled={typeof matome !== 'undefined'}
    />
  </label>

  <label class="label">
    Title (required)
    <input
      type="text"
      bind:value={title}
      required
      class="input"
      class:input-error={title !== undefined && !isTitleValid}
      maxlength="150"
      placeholder="My awesome notes"
    />
  </label>

  <label class="label">
    Summary
    <textarea
      bind:value={summary}
      class="textarea"
      class:input-error={summary !== undefined && !isSummaryValid}
      maxlength="300"
    />
  </label>

  <section>
    <h6>Notes (required)</h6>

    <TabGroup>
      <Tab bind:group={tabActive} name="edit" value={0}>Edit</Tab>
      <Tab bind:group={tabActive} name="recent-your-reactions" value={1}>Recent your reactions</Tab>
      <svelte:fragment slot="panel">
        {#if tabActive === 0}
          {#if $editor.editorInitialized}
            <Editor client={rxClient} {editor} />
          {:else}
            <LoadingSpinner />
          {/if}
        {:else if $editor.searchInitialized}
          <RecentReactionList client={rxClient} {editor} />
        {:else}
          <LoadingSpinner />
        {/if}
      </svelte:fragment>
    </TabGroup>
  </section>

  <hr />

  <div>
    <button on:click={onCancel} class="btn bg-surface-300">Cancel</button>
    <button
      on:click={onCreate}
      disabled={!isIdentifierValid || !isTitleValid || !isSummaryValid || $editor.notes.length <= 0}
      class="btn bg-primary-500"
    >
      {#if matome}
        Update
      {:else}
        Create
      {/if}
    </button>
  </div>

  {#if matome}
    <hr />

    <div>
      <button on:click={onDelete} class="btn bg-error-400">Delete</button>
    </div>
  {/if}
</form>
