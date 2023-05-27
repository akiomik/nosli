import { init, register } from 'svelte-i18n';
import { browser } from '$app/environment';

const defaultLocale = 'en';

register('en', () => import('$lib/locales/en.json'));
register('ja', () => import('$lib/locales/ja.json'));

init({
  fallbackLocale: defaultLocale,
  initialLocale: browser ? window.navigator.language : defaultLocale
});
