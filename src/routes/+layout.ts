import * as linkify from 'linkifyjs'; // eslint-disable-line @typescript-eslint/no-unused-vars
import 'linkify-plugin-hashtag';
import 'linkify-plugin-mention';
import { locale, waitLocale } from 'svelte-i18n';

import { appLocale } from '#lib/i18n/index.js';

export const ssr = false;

export const load = async () => {
  locale.set(appLocale(window.navigator.language));
  await waitLocale();
};
