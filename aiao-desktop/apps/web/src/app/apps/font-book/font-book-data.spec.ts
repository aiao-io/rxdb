import { describe, expect, it } from 'vitest';

import { filterFontFamilies, type FontFamilySummary } from './font-book-data';

const FAMILIES: readonly FontFamilySummary[] = [
  { name: 'SF Pro', stack: 'sans-serif', styles: 'Regular' },
  { name: 'Inter', stack: 'sans-serif', styles: 'Variable' },
  { name: 'JetBrains Mono', stack: 'monospace', styles: 'Regular' }
];

describe('filterFontFamilies', () => {
  it('按字体族名称筛选并忽略大小写', () => {
    expect(filterFontFamilies(FAMILIES, 'jetbrains').map(family => family.name)).toEqual(['JetBrains Mono']);
  });

  it('查询为空时保留原列表', () => {
    expect(filterFontFamilies(FAMILIES, '  ')).toBe(FAMILIES);
  });

  it('没有匹配项时返回空列表', () => {
    expect(filterFontFamilies(FAMILIES, 'missing')).toEqual([]);
  });
});
