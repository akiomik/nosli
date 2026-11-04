import { describe, expect, it } from 'vitest';

import en from './en.json';
import ja from './ja.json';

type Messages = { [key: string]: string | Messages };

const flatten = (messages: Messages, prefix = ''): [string, string][] =>
  Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'string' ? [[prefix + key, value]] : flatten(value, `${prefix}${key}.`)
  );

const placeholders = (message: string) =>
  [...message.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();

describe('locales', () => {
  const english = new Map(flatten(en));
  const japanese = new Map(flatten(ja));

  it('define the same messages', () => {
    expect([...japanese.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it('use the same values in each message', () => {
    const mismatched = [...english]
      .filter(
        ([key, message]) =>
          `${placeholders(japanese.get(key) ?? '')}` !== `${placeholders(message)}`
      )
      .map(([key]) => key);

    expect(mismatched).toEqual([]);
  });
});
