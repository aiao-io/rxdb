import { describe, expect, it } from 'vitest';
import { parseThemeValue } from './useTheme';

describe('parseThemeValue', () => {
  it.each(['light', 'dark', 'auto'] as const)('accepts %s', theme => {
    expect(parseThemeValue(theme)).toBe(theme);
  });

  it.each([null, '', 'system', 'LIGHT', ' dark '])('falls back to auto for %s', theme => {
    expect(parseThemeValue(theme)).toBe('auto');
  });
});
