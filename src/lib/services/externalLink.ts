import type { LinkTarget } from '$lib/stores/cookie';

export function externalEventUrl(target: LinkTarget, bech32: string): string {
  switch (target) {
    case 'nostter':
      return `https://nostter.app/${bech32}`;
    case 'lumilumi':
      return `https://lumilumi.app/${bech32}`;
    case 'snort':
      return `https://snort.social/e/${bech32}`;
  }
}

export function externalProfileUrl(target: LinkTarget, bech32: string): string {
  switch (target) {
    case 'nostter':
      return `https://nostter.app/${bech32}`;
    case 'lumilumi':
      return `https://lumilumi.app/${bech32}`;
    case 'snort':
      return `https://snort.social/p/${bech32}`;
  }
}

export function externalHashtagUrl(target: LinkTarget, tag: string): string {
  switch (target) {
    case 'nostter':
      return `https://nostter.app/hashtag/${tag}`;
    case 'lumilumi':
      return `https://lumilumi.app/hashtag/${tag}`;
    case 'snort':
      return `https://snort.social/t/${tag}`;
  }
}
