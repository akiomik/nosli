# nosli

Nosli helps you create a curated list of posts on [nostr](https://nostr.com).

- https://nosli.vercel.app

## How it works

A curated list is simply [NIP-23 Long Form Content](https://github.com/nostr-protocol/nips/blob/master/23.md) tagged with `"nosli"`.
It is stored in relays and can be viewed and edited by other NIP-23 supported clients.

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Checking

```bash
# type-check once, as CI does
npm run check

# type-check again whenever a file changes
npm run check:watch
```

Both run the TypeScript compiler and `svelte-check`, which each report errors that the other misses. For example, only the compiler reports an untyped SvelteKit `load`, because `svelte-check` adds types to route exports.

The checks cover the files that SvelteKit's generated `tsconfig.json` includes: `src/`, `test/` and `tests/`. Put Svelte components and other source files there, since files elsewhere are not type-checked.

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.
