<script lang="ts">
  import { nip19 } from 'nostr-tools';
  import { onDestroy, getContext } from 'svelte';
  import type { RxNostr } from 'rx-nostr';
  import { Tabs } from '@skeletonlabs/skeleton-svelte';
  import { _ } from 'svelte-i18n';

  import { goto } from '$app/navigation';
  import Alert from '$lib/components/Alert.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import Editor from '$lib/components/NoteEditor/Editor.svelte';
  import RecentReactionList from '$lib/components/NoteEditor/RecentReactionList.svelte';
  import LongFormContent from '$lib/entities/LongFormContent';
  import Tag from '$lib/entities/Tag';
  import NostrClient from '$lib/services/NostrClient';
  import {
    publicationFailureKey,
    publicationSuccessMessage,
    type PublicationAction
  } from '$lib/services/publicationFeedback';
  import type { PublicationResult } from '$lib/services/publishToRelays';
  import * as settings from '$lib/services/settings';
  import { createNoteEditorStore } from '$lib/stores/noteEditor';
  import { toaster } from '$lib/stores/toaster';

  const PARTIAL_SUCCESS_TOAST_TIMEOUT_MS = 8000;

  export let matome: LongFormContent | undefined = undefined;

  const rxClient: RxNostr = getContext('nostr-client');
  const client = new NostrClient(settings.defaultRelays);
  const editor = createNoteEditorStore({ matome, client: rxClient });

  let title: string | undefined = matome?.title;
  let summary: string | undefined = matome?.summary;
  let identifier: string | undefined = matome?.identifier || `nosli-${new Date().getTime()}`;
  let tabActive = 'edit';
  let inactive = false;
  let submission: 'saving' | 'deleting' | undefined = undefined;
  let failureKey: string | undefined = undefined;

  $: isIdentifierValid =
    identifier !== undefined && identifier.length > 0 && identifier.length <= 40;
  $: isTitleValid = title !== undefined && title.length > 0 && title.length <= 150;
  $: isSummaryValid = summary === undefined || summary.length <= 300;
  $: submitting = submission !== undefined;

  const notifySuccess = (action: PublicationAction, publication: PublicationResult) => {
    const { key, values } = publicationSuccessMessage(action, publication);
    toaster.success({
      title: $_(key, { values }),
      ...(values && { duration: PARTIAL_SUCCESS_TOAST_TIMEOUT_MS })
    });
  };

  const submit = async <T,>(
    kind: 'saving' | 'deleting',
    publish: () => Promise<T>,
    onPublished: (result: T) => void
  ) => {
    if (submission) return;
    submission = kind;
    failureKey = undefined;

    let result: T;
    try {
      result = await publish();
    } catch (error) {
      // Leaving the editor closes the client, which can discard an acknowledgment.
      if (inactive) return;
      console.error(error);
      failureKey = publicationFailureKey(error);
      submission = undefined;
      return;
    }

    // Stay in the submitting state on success so navigation cannot race another click.
    if (!inactive) onPublished(result);
  };

  const onCreate = async () => {
    if (identifier === undefined || title === undefined || $editor.notes.length <= 0) {
      throw new Error('Unexpected error: identifier or title is undefined');
    }

    const lfcContent = $editor.notes
      .map((loadingNote) => `nostr:${nip19.neventEncode({ id: loadingNote.id })}`)
      .join('\n');

    const tags = [
      ...$editor.notes.map(({ id }) => {
        return new Tag('e', id, '', 'mention');
      }),
      new Tag('t', 'nosli')
    ];
    const lfc = new LongFormContent(
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

    await submit(
      'saving',
      () => client.postLongFormContent(lfc),
      ({ content, publication }) => {
        notifySuccess(matome ? 'updated' : 'created', publication);
        goto(`/li/${content.nip19Id()}`);
      }
    );
  };

  const onCancel = () => {
    if (confirm($_('dialog.quit-editing-confirmation'))) {
      inactive = true;
      const path = matome ? `/li/${matome.nip19Id()}` : '/';
      goto(path);
    }
  };

  const onDelete = async () => {
    const id = matome?.id;
    if (!submission && matome && id && confirm($_('dialog.delete-list-confirmation'))) {
      const path = `/p/${nip19.npubEncode(matome.pubkey)}`;

      await submit(
        'deleting',
        () => client.deleteEvent(id),
        (publication) => {
          notifySuccess('deleted', publication);
          goto(path);
        }
      );
    }
  };

  onDestroy(async () => {
    inactive = true;
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
      disabled={typeof matome !== 'undefined' || submitting}
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
      disabled={submitting}
    />
  </label>

  <label class="label">
    {$_('summary')}
    <textarea
      bind:value={summary}
      class="textarea"
      class:input-error={summary !== undefined && !isSummaryValid}
      maxlength="300"
      disabled={submitting}></textarea>
  </label>

  <section inert={submitting}>
    <h6 class="text-sm md:text-base font-heading-token">{$_('notes-required')}</h6>

    <Tabs value={tabActive} onValueChange={(details) => (tabActive = details.value)}>
      {#snippet list()}
        <Tabs.Control value="edit">{$_('edit')}</Tabs.Control>
        <Tabs.Control value="recent-your-reactions">{$_('recent-your-reactions')}</Tabs.Control>
      {/snippet}
      {#snippet content()}
        <Tabs.Panel value="edit">
          {#if $editor.editorInitialized}
            <Editor {editor} />
          {:else}
            <LoadingSpinner />
          {/if}
        </Tabs.Panel>
        <Tabs.Panel value="recent-your-reactions">
          {#if $editor.searchInitialized}
            <RecentReactionList {editor} />
          {:else}
            <LoadingSpinner />
          {/if}
        </Tabs.Panel>
      {/snippet}
    </Tabs>
  </section>

  <hr />

  {#if failureKey}
    <div role="alert">
      <Alert variant="error">
        <p>{$_(failureKey)}</p>
      </Alert>
    </div>
  {/if}

  <div aria-live="polite">
    {#if submitting}
      <p class="mb-6">{$_('publication.waiting')}</p>
    {/if}

    <button on:click|preventDefault={onCancel} class="btn bg-surface-300">
      {$_('cancel')}
    </button>
    <button
      on:click|preventDefault={onCreate}
      disabled={submitting ||
        !isIdentifierValid ||
        !isTitleValid ||
        !isSummaryValid ||
        $editor.notes.length <= 0}
      class="btn bg-primary-500"
    >
      {#if submission === 'saving'}
        {$_('publication.saving')}
      {:else if matome}
        {$_('update')}
      {:else}
        {$_('create')}
      {/if}
    </button>
  </div>

  {#if matome}
    <hr />

    <div>
      <button on:click|preventDefault={onDelete} disabled={submitting} class="btn bg-error-400">
        {#if submission === 'deleting'}
          {$_('publication.deleting')}
        {:else}
          {$_('delete-this-list')}
        {/if}
      </button>
    </div>
  {/if}
</form>
