<script lang="ts">
  import { _ } from 'svelte-i18n';

  import MatomeForm from '$lib/components/MatomeForm.svelte';
</script>

<svelte:head>
  <title>{$_('create-new-list')} | Nosli</title>
</svelte:head>

<h1>{$_('create-new-list')}</h1>

<MatomeForm />
