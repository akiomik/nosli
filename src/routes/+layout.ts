import * as linkify from 'linkifyjs'; // eslint-disable-line @typescript-eslint/no-unused-vars
import 'linkify-plugin-hashtag';
import 'linkify-plugin-mention';
import { locale, waitLocale } from 'svelte-i18n';

import '$lib/i18n';

export const ssr = false;

export const load = async () => {
  locale.set(window.navigator.language);
  await waitLocale();
};
