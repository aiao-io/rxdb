import { describe, expect, it } from 'vitest';
import { parseTheme, resolveTheme } from './theme.service';

describe('theme helpers', () => {
  it.each([
    ['auto', 'auto'],
    ['light', 'light'],
    ['dark', 'dark'],
    [null, 'auto'],
    ['invalid', 'auto']
  ] as const)('parses %s as %s', (value, expected) => {
    expect(parseTheme(value)).toBe(expected);
  });

  it.each([
    ['auto', false, 'light'],
    ['auto', true, 'dark'],
    ['light', true, 'light'],
    ['dark', false, 'dark']
  ] as const)('resolves %s with system dark=%s as %s', (theme, systemIsDark, expected) => {
    expect(resolveTheme(theme, systemIsDark)).toBe(expected);
  });
});
