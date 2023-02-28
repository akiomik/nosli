<script lang="ts">
  import { FontAwesomeIcon } from '@fortawesome/svelte-fontawesome';
  import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';
  import LoginForm from '$lib/components/LoginForm.svelte';
  import Alert from '$lib/components/Alert.svelte';

  const title = 'Login | Nosli';
  const desc = 'Login to Nosli';
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={desc} />
  <meta name="keywords" content="nosli,nostr,curated,list,posts,damus,snort" />
  <meta property="og:url" content="https://nosli.vercel.app/login" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={desc} />
</svelte:head>

<h1>Login</h1>

<Alert variant="">
  <div slot="icon">
    <h2 class="flex space-x-2">
      <FontAwesomeIcon icon={faCircleInfo} />
      <p>Note</p>
    </h2>
  </div>

  <p>You can create or edit matomes by logging in with nsec.</p>
</Alert>

<LoginForm />
