import preprocess from 'svelte-preprocess';
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://kit.svelte.dev/docs/integrations#preprocessors
  // for more information about preprocessors
  preprocess: [
    vitePreprocess(),
    preprocess({
      postcss: true
    })
  ],

  kit: {
    adapter: adapter({ runtime: 'nodejs22.x' }),
    typescript: {
      // nostr-tools v1 ships type declarations but does not expose them via package exports.
      config: (config) => {
        config.compilerOptions.paths['nostr-tools'] = [
          '../node_modules/nostr-tools/lib/index.d.ts'
        ];
      }
    }
  }
};

export default config;
