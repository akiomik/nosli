import linkifyHtml from 'linkify-html';
import type { Action } from 'svelte/types/runtime/action';
import type { Opts } from 'linkifyjs';

import type { LinkTarget } from '$lib/stores/cookie';
import {
  externalEventUrl,
  externalHashtagUrl,
  externalProfileUrl
} from '$lib/services/externalLink';

export function makeLinkifyOpts(target: LinkTarget): Opts {
  return {
    target: '_blank',
    rel: 'external noreferrer',
    format: (value: string, type: string) => {
      if (type === 'mention') {
        return `${value.substring(0, 9)}:${value.substring(value.length - 8, value.length)}`;
      }

      return value;
    },
    formatHref: (href: string, type: string) => {
      if (type === 'hashtag') {
        return externalHashtagUrl(target, href.substring(1));
      } else if (
        type === 'mention' &&
        (href.startsWith('/npub1') || href.startsWith('/nprofile1'))
      ) {
        return externalProfileUrl(target, href.substring(1));
      } else if (type === 'mention' && (href.startsWith('/note1') || href.startsWith('/nevent1'))) {
        return externalEventUrl(target, href.substring(1));
      } else {
        return href;
      }
    },
    truncate: 54,
    validate: (value: string, type: string) => {
      if (type === 'url' && !value.startsWith('http')) {
        return false;
      }

      return true;
    },
    nl2br: true
  };
}

// Backwards-compatible default opts (uses 'nostter' as the default target).
export const linkifyOpts = makeLinkifyOpts('nostter');

export const linkify: Action = (element: HTMLElement, opts: Opts) => {
  element.innerHTML = linkifyHtml(element.innerHTML, opts);
};
