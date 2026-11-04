import { init, register } from 'svelte-i18n';
import { browser } from '$app/env';

const defaultLocale = 'en';
// The locales registered below.
const locales = ['en', 'ja'];

register('en', () => import('#lib/locales/en.json'));
register('ja', () => import('#lib/locales/ja.json'));

// The locale for a browser language: the language itself, with its region for dates, when there
// are messages for it, and the default otherwise. svelte-i18n would show the default messages for
// any other language too, but would still set <html lang> to it and format dates in it.
export const appLocale = (language: string) =>
  locales.includes(language.split('-')[0]) ? language : defaultLocale;

init({
  fallbackLocale: defaultLocale,
  initialLocale: browser ? appLocale(window.navigator.language) : defaultLocale
});
