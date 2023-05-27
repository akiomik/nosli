<script lang="ts">
  import { FontAwesomeIcon } from '@fortawesome/svelte-fontawesome';
  import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';
  import { _ } from 'svelte-i18n';

  import LoginForm from '$lib/components/LoginForm.svelte';
  import Alert from '$lib/components/Alert.svelte';

  $: title = `${$_('login')} | Nosli`;
  $: desc = $_('login-to-nosli');
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={desc} />
  <meta name="keywords" content="nosli,nostr,curated,list,posts,damus,snort" />
  <meta property="og:url" content="https://nosli.vercel.app/login" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={desc} />
</svelte:head>

<h1>{$_('login')}</h1>

<Alert>
  <div slot="icon">
    <h2 class="flex items-center space-x-2">
      <FontAwesomeIcon icon={faCircleInfo} />
    </h2>
  </div>

  <p>{$_('alert.nsec-and-nip07-info')}</p>
</Alert>

<LoginForm />
