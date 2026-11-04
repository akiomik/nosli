import { describe, expect, it } from 'vitest';
import { getMessageFormatter } from 'svelte-i18n';

import en from './en.json';
import ja from './ja.json';

type Messages = { [key: string]: string | Messages };

const flatten = (messages: Messages, prefix = ''): [string, string][] =>
  Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'string' ? [[prefix + key, value]] : flatten(value, `${prefix}${key}.`)
  );

type Element = {
  type: number;
  value?: unknown;
  options?: Record<string, { value: Element[] }>;
  children?: Element[];
};

// Argument, number, date, time, select and plural elements name a value.
const names = (elements: Element[]): string[] =>
  elements.flatMap((element) => [
    ...(element.type >= 1 && element.type <= 6 ? [String(element.value)] : []),
    ...Object.values(element.options ?? {}).flatMap(({ value }) => names(value)),
    ...names(element.children ?? [])
  ]);

// The values that a message takes, as svelte-i18n parses it. A malformed message throws.
const placeholders = (message: string, locale: string) =>
  [...new Set(names(getMessageFormatter(message, locale).getAst() as Element[]))].sort();

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
          `${placeholders(japanese.get(key) ?? '', 'ja')}` !== `${placeholders(message, 'en')}`
      )
      .map(([key]) => key);

    expect(mismatched).toEqual([]);
  });
});
