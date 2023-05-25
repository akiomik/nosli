import urlRegexSafe from 'url-regex-safe';
import type { Action } from 'svelte/types/runtime/action';

export type Opts = {
  extPattern: RegExp;
  validate: (value: string, extensions: RegExp) => boolean;
  attributes: object;
  tagName: string;
  className: string;
  render: (tagName: string, attributes: object) => string;
};

const defaultOpts: Opts = {
  extPattern: /(jpe?g|png|gif|webp)$/,
  validate: (value: string, extPattern: RegExp) =>
    new URL(value.toLowerCase()).pathname.match(extPattern) !== null,
  attributes: {},
  tagName: 'img',
  className: '',
  render: (tagName: string, attributes: object) => {
    const encodedAttrs = Object.entries(attributes)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');
    return `<${tagName} ${encodedAttrs}>`;
  }
};

export const inlineImage: Action = (node: HTMLElement, opts: Partial<Opts>) => {
  const mergedOpts = { ...defaultOpts, ...opts };

  const matches = node.innerHTML.matchAll(urlRegexSafe());
  if (matches === null) {
    return;
  }

  // TODO: traverse innerText of children
  let text = node.innerHTML;
  [...matches].forEach((match) => {
    const urlString = match[0];
    if (!mergedOpts.validate(urlString, mergedOpts.extPattern)) {
      return;
    }

    const attributes = {
      ...mergedOpts.attributes,
      src: urlString,
      class: mergedOpts.className
    };
    const tag = mergedOpts.render(mergedOpts.tagName, attributes);
    text = text.replace(urlString, tag);
  });

  node.innerHTML = text;
};
