<script>
  import { AppShell } from '@skeletonlabs/skeleton';
  import '@skeletonlabs/skeleton/themes/theme-skeleton.css';
  import '@skeletonlabs/skeleton/styles/all.css';
  import '../app.postcss';
</script>

<AppShell>
  <div class="container mx-auto p-4 space-y-8 mt-4">
    <slot />
  </div>
</AppShell>
