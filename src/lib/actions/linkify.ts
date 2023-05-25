import linkifyHtml from 'linkify-html';
import type { Action } from 'svelte/types/runtime/action';
import type { Opts } from 'linkifyjs';

export const linkifyOpts = {
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
      return `https://snort.social/t/${href.substring(1)}`;
    } else if (type === 'mention' && href.startsWith('/npub')) {
      return `https://snort.social/p/${href.substring(1)}`;
    } else if (type === 'mention' && href.startsWith('/note')) {
      return `https://snort.social/e/${href.substring(1)}`;
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

export const linkify: Action = (element: HTMLElement, opts: Opts) => {
  element.innerHTML = linkifyHtml(element.innerHTML, opts);
};
