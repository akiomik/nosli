<script lang="ts">
  import { nip19 } from 'nostr-tools';
  import { onDestroy, getContext } from 'svelte';
  import type { RxNostr } from 'rx-nostr';
  import { Tabs } from '@skeletonlabs/skeleton-svelte';
  import { _ } from 'svelte-i18n';

  import { goto } from '$app/navigation';
  import { focusWhen } from '#lib/actions/focusWhen.js';
  import Alert from '#lib/components/Alert.svelte';
  import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';
  import Nip07Waiting from '#lib/components/Nip07Waiting.svelte';
  import Editor from '#lib/components/NoteEditor/Editor.svelte';
  import RecentReactionList from '#lib/components/NoteEditor/RecentReactionList.svelte';
  import LongFormContent from '#lib/entities/LongFormContent.js';
  import { Nip07CanceledError } from '#lib/services/KeyManager.js';
  import NostrClient, { type SigningOptions } from '#lib/services/NostrClient.js';
  import { initialIdentifier, isValidIdentifier } from '#lib/services/listIdentifier.js';
  import {
    publicationFailureKey,
    publicationSuccessMessage,
    type PublicationAction
  } from '#lib/services/publicationFeedback.js';
  import type { PublicationResult } from '#lib/services/publishToRelays.js';
  import * as settings from '#lib/services/settings.js';
  import { loginMethod } from '#lib/stores/login.js';
  import { createNoteEditorStore } from '#lib/stores/noteEditor.js';
  import { toaster } from '#lib/stores/toaster.js';

  const PARTIAL_SUCCESS_TOAST_TIMEOUT_MS = 8000;

  export let matome: LongFormContent | undefined = undefined;
  // Until the requests for the list and for its deletion requests have ended, saving could publish
  // a version that its author deleted.
  export let checkingDeletion = false;

  const rxClient: RxNostr = getContext('nostr-client');
  const client = new NostrClient(settings.defaultRelays);
  const editor = createNoteEditorStore({ matome, client: rxClient });

  let title: string | undefined = matome?.title;
  let summary: string | undefined = matome?.summary;
  let identifier = initialIdentifier(matome);
  let tabActive = 'edit';
  let inactive = false;
  let submission: 'saving' | 'deleting' | undefined = undefined;
  let failureKey: string | undefined = undefined;
  // Set while the signer has the event, to stop waiting for it.
  let signing: AbortController | undefined = undefined;
  // What the user stopped signing, whose button then takes the focus back.
  let canceled: 'saving' | 'deleting' | undefined = undefined;

  $: isIdentifierValid = isValidIdentifier(identifier, matome);
  $: isTitleValid = title !== undefined && title.length > 0 && title.length <= 150;
  $: isSummaryValid = summary === undefined || summary.length <= 300;
  $: submitting = submission !== undefined;

  const notifySuccess = (action: PublicationAction, publication: PublicationResult) => {
    const { key, values } = publicationSuccessMessage(action, publication);
    const title = $_(key, { values });
    if (!values) {
      toaster.success({ title });
      return;
    }

    // A partial deletion can leave the list on other relays, unlike a partial publication.
    toaster.create({
      type: action === 'deleted' ? 'warning' : 'info',
      title,
      duration: PARTIAL_SUCCESS_TOAST_TIMEOUT_MS
    });
  };

  const submit = async <T,>(
    kind: 'saving' | 'deleting',
    publish: (signingOptions: SigningOptions) => Promise<T>,
    onPublished: (result: T) => void
  ) => {
    if (submission) return;
    submission = kind;
    failureKey = undefined;
    canceled = undefined;

    const attempt = new AbortController();
    const signingOptions: SigningOptions = {
      signal: attempt.signal,
      onSigning: (isSigning) => (signing = isSigning ? attempt : undefined)
    };
    let result: T;
    try {
      result = await publish(signingOptions);
    } catch (error) {
      // Leaving the editor closes the client, which can discard an acknowledgment.
      if (inactive) return;
      if (error instanceof Nip07CanceledError) {
        canceled = kind;
        submission = undefined;
        return;
      }
      console.error(error);
      failureKey = publicationFailureKey(error);
      submission = undefined;
      return;
    }

    // Stay in the submitting state on success so navigation cannot race another click.
    if (!inactive) onPublished(result);
  };

  const onCreate = async () => {
    if (checkingDeletion) return;
    if (title === undefined || $editor.notes.length <= 0) {
      throw new Error('Unexpected error: the title or the notes are missing');
    }

    const lfc = LongFormContent.compose({
      // An update is always at the address of the list.
      identifier: matome ? matome.identifier : identifier,
      title,
      summary: summary || '',
      notes: $editor.notes,
      previous: matome
    });

    await submit(
      'saving',
      (signingOptions) => client.postLongFormContent(lfc, matome?.pubkey, signingOptions),
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
    const article = matome;
    if (!submission && article && confirm($_('dialog.delete-list-confirmation'))) {
      const path = `/p/${nip19.npubEncode(article.pubkey)}`;

      await submit(
        'deleting',
        (signingOptions) => client.deleteArticle(article, signingOptions),
        (publication) => {
          notifySuccess('deleted', publication);
          goto(path);
        }
      );
    }
  };

  onDestroy(async () => {
    inactive = true;
    // An extension that is still loading is then not asked for the key.
    editor.cancelSearch();
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
      class:input-error={!isIdentifierValid}
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
      <Tabs.List>
        <Tabs.Trigger value="edit">{$_('edit')}</Tabs.Trigger>
        <!-- The longer label wraps on a narrow screen, while Edit keeps to one line. -->
        <Tabs.Trigger
          value="recent-your-reactions"
          class="whitespace-normal text-balance [line-break:strict]"
        >
          {$_('recent-your-reactions')}
        </Tabs.Trigger>
        <Tabs.Indicator />
      </Tabs.List>
      <Tabs.Content value="edit">
        {#if $editor.editorInitialized}
          <Editor {editor} />
        {:else}
          <LoadingSpinner />
        {/if}
      </Tabs.Content>
      <Tabs.Content value="recent-your-reactions">
        {#if $editor.searchInitialized}
          <RecentReactionList {editor} />
        {:else}
          <LoadingSpinner>
            {#if $editor.searchAwaitingKey && $loginMethod === 'nip07'}
              <Nip07Waiting
                centered
                cancelLabel={$_('cancel-getting-public-key')}
                on:cancel={editor.cancelSearch}
              />
            {/if}
          </LoadingSpinner>
        {/if}
      </Tabs.Content>
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

  {#if matome?.hasContentBesidesNotes()}
    <!-- The warning above the form has scrolled away on a long list. -->
    <p>{$_('alert.content-replaced-on-save')}</p>
  {/if}

  <div aria-live="polite">
    {#if signing && $loginMethod === 'nip07'}
      <div class="mb-6">
        <!-- Takes the focus from the save or delete button, which is disabled meanwhile. -->
        <Nip07Waiting
          live={false}
          focus
          cancelLabel={$_('cancel-signing')}
          on:cancel={() => signing?.abort()}
        />
      </div>
    {:else if submitting}
      <p class="mb-6">{$_('publication.waiting')}</p>
    {:else if canceled}
      <p class="mb-6">{$_('publication.canceled')}</p>
    {:else if checkingDeletion}
      <p class="mb-6">{$_('checking-deletion')}</p>
    {/if}

    <button on:click|preventDefault={onCancel} class="btn bg-surface-300">
      {$_('cancel')}
    </button>
    <button
      on:click|preventDefault={onCreate}
      disabled={submitting ||
        checkingDeletion ||
        !isIdentifierValid ||
        !isTitleValid ||
        !isSummaryValid ||
        $editor.notes.length <= 0 ||
        $editor.adding.length > 0}
      use:focusWhen={canceled === 'saving'}
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
      <button
        on:click|preventDefault={onDelete}
        disabled={submitting}
        use:focusWhen={canceled === 'deleting'}
        class="btn bg-error-400 text-black"
      >
        {#if submission === 'deleting'}
          {$_('publication.deleting')}
        {:else}
          {$_('delete-this-list')}
        {/if}
      </button>
    </div>
  {/if}
</form>
