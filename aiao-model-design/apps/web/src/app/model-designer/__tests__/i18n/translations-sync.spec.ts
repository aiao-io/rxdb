import { describe, expect, it } from 'vitest';
import { DEFAULT_TRANSLATIONS } from '../../i18n/translations';
import { ZH_TRANSLATIONS } from '../../i18n/zh';

/** 收集对象树中所有叶子键路径（如 `entityPanel.emptyProperties`） */
function collectLeafKeys(obj: unknown, prefix = ''): string[] {
  const keys: string[] = [];
  if (typeof obj !== 'object' || obj === null) return keys;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) keys.push(...collectLeafKeys(value, path));
    else keys.push(path);
  }
  return keys;
}

describe('i18n translations sync', () => {
  it('keeps ZH and DEFAULT translation keys in sync', () => {
    const enKeys = collectLeafKeys(DEFAULT_TRANSLATIONS);
    const zhKeys = collectLeafKeys(ZH_TRANSLATIONS);

    expect(new Set(zhKeys)).toEqual(new Set(enKeys));
  });
});
