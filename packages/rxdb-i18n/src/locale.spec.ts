import { resolveUiLocale } from './locale.js';

describe('UI locale resolution', () => {
  it.each([
    ['en', 'en'],
    ['en-US', 'en'],
    ['en-GB', 'en'],
    ['zh', 'zh-Hans'],
    ['zh-CN', 'zh-Hans'],
    ['fr-FR', 'zh-Hans'],
    ['invalid_locale', 'zh-Hans'],
    [undefined, 'zh-Hans']
  ])('resolves %s to %s', (input, expected) => {
    expect(resolveUiLocale(input)).toBe(expected);
  });
});
