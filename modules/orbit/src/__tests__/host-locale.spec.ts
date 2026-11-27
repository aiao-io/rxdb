import { describe, expect, it } from 'vitest';
import { parseHostLocale } from '../host-locale.js';

describe('parseHostLocale', () => {
  it.each(['en', 'zh-Hans'] as const)('accepts %s', locale => {
    expect(parseHostLocale(locale)).toBe(locale);
  });

  it.each([undefined, null, '', 'fr', 'en-US', 'EN', 42, { locale: 'en' }])('rejects unknown payload %s', value => {
    expect(parseHostLocale(value)).toBeUndefined();
  });
});
