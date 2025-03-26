<script lang="ts">
  import { nip19 } from 'nostr-tools';
  import { onDestroy, getContext } from 'svelte';
  import type { RxNostr } from 'rx-nostr';
  import { TabGroup, Tab } from '@skeletonlabs/skeleton';
  import { toastStore } from '@skeletonlabs/skeleton';
  import { _ } from 'svelte-i18n';

  import { goto } from '$app/navigation';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import Editor from '$lib/components/NoteEditor/Editor.svelte';
  import RecentReactionList from '$lib/components/NoteEditor/RecentReactionList.svelte';
  import LongFormContent from '$lib/entities/LongFormContent';
  import Tag from '$lib/entities/Tag';
  import NostrClient from '$lib/services/NostrClient';
  import * as settings from '$lib/services/settings';
  import { createNoteEditorStore } from '$lib/stores/noteEditor';

  export let matome: LongFormContent | undefined = undefined;

  const rxClient: RxNostr = getContext('nostr-client');
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

    const lfcContent = $editor.notes
      .map((loadingNote, i) => `nostr:${nip19.neventEncode({ id: loadingNote.id })}`)
      .join('\n');

    const tags = [
      ...$editor.notes.map(({ id }) => {
        return new Tag('e', id, '', 'mention');
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

    const message = matome ? $_('updated') : $_('created');
    toastStore.trigger({ message, background: 'bg-surface-300' });

    goto(`/li/${lfc.nip19Id()}`);
  };

  const onCancel = () => {
    if (confirm($_('dialog.quit-editing-confirmation'))) {
      const path = matome ? `/li/${matome.nip19Id()}` : '/';
      goto(path);
    }
  };

  const onDelete = async () => {
    if (matome?.id && confirm($_('dialog.delete-list-confirmation'))) {
      await client.deleteEvent(matome.id);

      toastStore.trigger({ message: $_('deleted'), background: 'bg-surface-300' });

      goto(`/p/${nip19.npubEncode(matome.pubkey)}`);
    }
  };

  onDestroy(async () => {
    await client.close();
  });
</script>

<form class="flex flex-col space-y-6" novalidate>
  <label class="label">
    {$_('identifier-required')}
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
    {$_('title-required')}
    <input
      type="text"
      bind:value={title}
      required
      class="input"
      class:input-error={title !== undefined && !isTitleValid}
      maxlength="150"
      placeholder={$_('title-placeholder')}
    />
  </label>

  <label class="label">
    {$_('summary')}
    <textarea
      bind:value={summary}
      class="textarea"
      class:input-error={summary !== undefined && !isSummaryValid}
      maxlength="300"
    />
  </label>

  <section>
    <h6>{$_('notes-required')}</h6>

    <TabGroup>
      <Tab bind:group={tabActive} name="edit" value={0}>{$_('edit')}</Tab>
      <Tab bind:group={tabActive} name="recent-your-reactions" value={1}>
        {$_('recent-your-reactions')}
      </Tab>
      <svelte:fragment slot="panel">
        {#if tabActive === 0}
          {#if $editor.editorInitialized}
            <Editor {editor} />
          {:else}
            <LoadingSpinner />
          {/if}
        {:else if $editor.searchInitialized}
          <RecentReactionList {editor} />
        {:else}
          <LoadingSpinner />
        {/if}
      </svelte:fragment>
    </TabGroup>
  </section>

  <hr />

  <div>
    <button on:click|preventDefault={onCancel} class="btn bg-surface-300">
      {$_('cancel')}
    </button>
    <button
      on:click|preventDefault={onCreate}
      disabled={!isIdentifierValid || !isTitleValid || !isSummaryValid || $editor.notes.length <= 0}
      class="btn bg-primary-500"
    >
      {#if matome}
        {$_('update')}
      {:else}
        {$_('create')}
      {/if}
    </button>
  </div>

  {#if matome}
    <hr />

    <div>
      <button on:click|preventDefault={onDelete} class="btn bg-error-400">
        {$_('delete-this-list')}
      </button>
    </div>
  {/if}
</form>
