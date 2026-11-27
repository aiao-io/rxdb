import { describe, expect, it } from 'vitest';

import {
  filterByCollection,
  filterFontFamilies,
  isStringList,
  previewScale,
  recordRecentFont,
  scaleSizes,
  toggleName,
  type FontFamilySummary
} from './font-book-data';

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

describe('filterByCollection', () => {
  it('全部集合原样返回', () => {
    expect(filterByCollection(FAMILIES, 'all', ['Inter'], ['JetBrains Mono'])).toBe(FAMILIES);
  });

  it('收藏只留名单里的字体', () => {
    expect(filterByCollection(FAMILIES, 'favourites', ['Inter'], []).map(font => font.name)).toEqual(['Inter']);
  });

  it('最近使用按记录次序排', () => {
    expect(filterByCollection(FAMILIES, 'recent', [], ['JetBrains Mono', 'SF Pro']).map(font => font.name)).toEqual([
      'JetBrains Mono',
      'SF Pro'
    ]);
    expect(filterByCollection(FAMILIES, 'recent', [], []).map(font => font.name)).toEqual([]);
  });
});

describe('toggleName / recordRecentFont', () => {
  it('名单里加上或去掉', () => {
    expect(toggleName(['Inter'], 'SF Pro')).toEqual(['Inter', 'SF Pro']);
    expect(toggleName(['Inter', 'SF Pro'], 'Inter')).toEqual(['SF Pro']);
  });

  it('最近使用移到最前并去重，超过上限丢最旧的', () => {
    expect(recordRecentFont(['SF Pro', 'Inter'], 'Inter')).toEqual(['Inter', 'SF Pro']);
    const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(recordRecentFont(eight, 'z')).toEqual(['z', 'a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });
});

describe('previewScale / scaleSizes', () => {
  it('滑杆比例映射成 0.6..1.8 的倍率', () => {
    expect(previewScale(0)).toBeCloseTo(0.6);
    expect(previewScale(1)).toBeCloseTo(1.8);
    expect(previewScale(0.5)).toBeCloseTo(1.2);
  });

  it('示例字号按倍率缩放取整', () => {
    expect(scaleSizes([42, 11], 1.5)).toEqual([63, 17]);
  });
});

describe('isStringList', () => {
  it('只认字符串数组', () => {
    expect(isStringList([])).toBe(true);
    expect(isStringList(['a'])).toBe(true);
    expect(isStringList('a')).toBe(false);
    expect(isStringList([1])).toBe(false);
  });
});
