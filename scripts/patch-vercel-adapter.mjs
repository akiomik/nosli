import { readFileSync, writeFileSync } from 'node:fs';

// SvelteKit 1 requires adapter-vercel 2, whose runtime list predates Node 22.
// Remove this compatibility patch when migrating to a supported adapter major.
const packageUrl = new URL(
  '../node_modules/@sveltejs/adapter-vercel/package.json',
  import.meta.url
);
const { version } = JSON.parse(readFileSync(packageUrl, 'utf8'));
if (version !== '2.4.3') {
  throw new Error(`Unexpected @sveltejs/adapter-vercel version: ${version}`);
}

const patches = [
  {
    path: 'index.js',
    before: "const VALID_RUNTIMES = ['edge', 'nodejs16.x', 'nodejs18.x'];",
    after: "const VALID_RUNTIMES = ['edge', 'nodejs16.x', 'nodejs18.x', 'nodejs22.x'];"
  },
  {
    path: 'index.d.ts',
    before: "runtime?: 'nodejs16.x' | 'nodejs18.x';",
    after: "runtime?: 'nodejs16.x' | 'nodejs18.x' | 'nodejs22.x';"
  }
];

for (const { path, before, after } of patches) {
  const url = new URL(`../node_modules/@sveltejs/adapter-vercel/${path}`, import.meta.url);
  const source = readFileSync(url, 'utf8');
  if (source.includes(after)) continue;
  if (!source.includes(before)) throw new Error(`Cannot patch ${path}: upstream content changed`);
  writeFileSync(url, source.replace(before, after));
}
