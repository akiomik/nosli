import type { LinkTarget } from '$lib/stores/cookie';

export function externalEventUrl(target: LinkTarget, bech32: string): string {
  switch (target) {
    case 'nostter':
      return `https://nostter.app/${bech32}`;
    case 'lumilumi':
      return `https://lumilumi.app/${bech32}`;
    case 'nos-haiku':
      return `https://nos-haiku.pages.dev/entry/${bech32}`;
    case 'nostrudel':
      return `https://nostrudel.ninja/n/${bech32}`;
    case 'astraea':
      return `https://astraea.mousedev.page/${bech32}`;
    case 'primal':
      return `https://primal.net/e/${bech32}`;
    case 'iris':
      return `https://iris.to/${bech32}`;
    case 'snort':
      return `https://snort.social/e/${bech32}`;
    case 'yakihonne':
      return `https://yakihonne.com/note/${bech32}`;
  }
}

export function externalProfileUrl(target: LinkTarget, bech32: string): string {
  switch (target) {
    case 'nostter':
      return `https://nostter.app/${bech32}`;
    case 'lumilumi':
      return `https://lumilumi.app/${bech32}`;
    case 'nos-haiku':
      return `https://nos-haiku.pages.dev/${bech32}`;
    case 'nostrudel':
      return `https://nostrudel.ninja/u/${bech32}`;
    case 'astraea':
      return `https://astraea.mousedev.page/${bech32}`;
    case 'primal':
      return `https://primal.net/p/${bech32}`;
    case 'iris':
      return `https://iris.to/${bech32}`;
    case 'snort':
      return `https://snort.social/p/${bech32}`;
    case 'yakihonne':
      return `https://yakihonne.com/users/${bech32}`;
  }
}

export function externalHashtagUrl(target: LinkTarget, tag: string): string {
  switch (target) {
    case 'nostter':
      return `https://nostter.app/hashtag/${tag}`;
    case 'lumilumi':
      return `https://lumilumi.app/hashtag/${tag}`;
    case 'nos-haiku':
      return `https://nos-haiku.pages.dev/hashtag/${tag}`;
    case 'nostrudel':
      return `https://nostrudel.ninja/t/${tag}`;
    case 'astraea':
      return `https://astraea.mousedev.page/hashtag/${tag}`;
    case 'primal':
      return `https://primal.net/search/%23${tag}`;
    case 'iris':
      return `https://iris.to/search/%23${tag}`;
    case 'snort':
      return `https://snort.social/t/${tag}`;
    case 'yakihonne':
      return `https://yakihonne.com/topic/${tag}`;
  }
}
