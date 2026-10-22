import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    ignores: [
      '.svelte-kit/**',
      '.vercel/**',
      'build/**',
      'package/**',
      'node_modules/**',
      '**/*.cjs',
      'vite.config.*.timestamp-*'
    ]
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts,svelte}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module', ecmaVersion: 2020 },
      globals: { ...globals.browser, ...globals.node }
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': 'warn'
    }
  },
  ...svelte.configs.recommended,
  {
    files: ['**/*.svelte'],
    languageOptions: { parserOptions: { parser: tsParser } },
    rules: {
      'svelte/no-navigation-without-resolve': 'off',
      'svelte/no-immutable-reactive-statements': 'off',
      'svelte/require-event-dispatcher-types': 'off'
    }
  },
  prettier
];
