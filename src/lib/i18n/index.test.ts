import { describe, expect, it, vi } from 'vitest';

import { appLocale } from './index';

vi.mock('$app/env', () => ({ browser: false }));

describe('appLocale', () => {
  it.each(['ja', 'ja-JP', 'en', 'en-US', 'en-GB'])('keeps %s, which has messages', (language) => {
    expect(appLocale(language)).toBe(language);
  });

  it.each(['fr-FR', 'zh-CN', 'zh-Hant-TW', 'jav'])(
    'uses English for %s, which has no messages',
    (language) => {
      expect(appLocale(language)).toBe('en');
    }
  );
});
