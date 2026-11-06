import { describe, expect, it } from 'vitest';
import {
  cardSizeOptions,
  clearDisplayPreferences,
  contentAlignOptions,
  defaultDisplayPreferences,
  displayStorageKey,
  feedColumnMin,
  isDefaultDisplay,
  libraryCardMin,
  maxColumns,
  pageMaxWidth,
  pageWidthOptions,
  readDisplayPreferences,
  saveDisplayPreferences,
  type DisplayPreferences
} from './display-preferences';

/** 只实现 Storage 的三个读写方法，足够覆盖偏好的读取与保存。 */
function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key)
  };
}

describe('显示偏好的选项表', () => {
  it('每组选项的编号互不重复，默认值都在选项里', () => {
    for (const [options, fallback] of [
      [pageWidthOptions, defaultDisplayPreferences.pageWidth],
      [cardSizeOptions, defaultDisplayPreferences.cardSize],
      [contentAlignOptions, defaultDisplayPreferences.align]
    ] as const) {
      const ids = options.map(option => option.id as string);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain(fallback);
    }
  });

  it('页面宽度从窄到宽排列，只有「铺满窗口」没有上限', () => {
    const limits = pageWidthOptions.map(option => pageMaxWidth(option.id));
    expect(limits.slice(0, -1)).toEqual([...limits.slice(0, -1)].sort((a, b) => a! - b!));
    expect(limits.at(-1)).toBeNull();
    expect(limits.slice(0, -1).every(limit => limit !== null && limit > 0)).toBe(true);
  });

  it('默认宽度能完整容纳 3440 宽的带鱼屏，而不是沿用旧的 1600 上限', () => {
    const sidebar = 208;
    const gutters = 64;
    expect(pageMaxWidth(defaultDisplayPreferences.pageWidth)).toBeGreaterThanOrEqual(3440 - sidebar - gutters);
  });

  it('卡片越大，瀑布流单列和作品网格的最小宽度都越大', () => {
    const feed = cardSizeOptions.map(option => feedColumnMin(option.id));
    const library = cardSizeOptions.map(option => libraryCardMin(option.id));
    expect(feed).toEqual([...feed].sort((a, b) => a - b));
    expect(library).toEqual([...library].sort((a, b) => a - b));
    expect(new Set(feed).size).toBe(feed.length);
    expect(new Set(library).size).toBe(library.length);
  });

  it('默认卡片大小保持原先的 190 px 单列，作品网格在 1440 宽窗口里仍是三列', () => {
    expect(feedColumnMin(defaultDisplayPreferences.cardSize)).toBe(190);
    // 1440 宽窗口的主区内容宽 1168，网格间距 18 px。
    const columns = Math.floor((1168 + 18) / (libraryCardMin(defaultDisplayPreferences.cardSize) + 18));
    expect(columns).toBe(3);
  });

  it('卡片越大，一行最多的列数越少；超宽屏靠列数封顶让卡片放大，而不是无限加列', () => {
    const caps = cardSizeOptions.map(option => maxColumns(option.id));
    expect(caps).toEqual([12, 8, 6, 4]);
    expect(caps).toEqual([...caps].sort((a, b) => b - a));
    expect(maxColumns(defaultDisplayPreferences.cardSize)).toBe(8);
  });

  it('每页 24 张作品在每一档的列数上都恰好排成整行，不留半行', () => {
    for (const option of cardSizeOptions) expect(24 % maxColumns(option.id)).toBe(0);
  });
});

describe('读取显示偏好', () => {
  it('没有保存过时使用默认值，并且每次返回独立的对象', () => {
    const first = readDisplayPreferences(memory());
    expect(first).toEqual(defaultDisplayPreferences);
    first.pageWidth = 'compact';
    expect(readDisplayPreferences(memory())).toEqual(defaultDisplayPreferences);
  });

  it('保存后原样读回', () => {
    const storage = memory();
    const chosen: DisplayPreferences = { pageWidth: 'compact', cardSize: 'xlarge', align: 'start' };
    saveDisplayPreferences(storage, chosen);
    expect(readDisplayPreferences(storage)).toEqual(chosen);
  });

  it('只保存已知的三项，不把多余字段写进存储', () => {
    const storage = memory();
    const withExtra = { pageWidth: 'wide', cardSize: 'small', align: 'center', token: 'secret' };
    saveDisplayPreferences(storage, withExtra as DisplayPreferences);
    expect(JSON.parse(storage.data.get(displayStorageKey)!)).toEqual({
      pageWidth: 'wide',
      cardSize: 'small',
      align: 'center'
    });
  });

  it('某一项无法识别时只让这一项回到默认，其余选择保留', () => {
    const storage = memory({
      [displayStorageKey]: JSON.stringify({ pageWidth: 'gigantic', cardSize: 'large', align: 7 })
    });
    expect(readDisplayPreferences(storage)).toEqual({
      pageWidth: defaultDisplayPreferences.pageWidth,
      cardSize: 'large',
      align: defaultDisplayPreferences.align
    });
  });

  it.each([['not json'], ['null'], ['42'], ['"compact"'], ['[]'], ['']])('内容损坏（%j）时使用默认值', saved => {
    expect(readDisplayPreferences(memory({ [displayStorageKey]: saved }))).toEqual(defaultDisplayPreferences);
  });

  it('浏览器禁用了存储（读取即抛错）时使用默认值，不阻断应用', () => {
    const blocked = {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      setItem: () => undefined,
      removeItem: () => undefined
    };
    expect(readDisplayPreferences(blocked)).toEqual(defaultDisplayPreferences);
  });
});

describe('写入与重置', () => {
  it('写入失败时把错误交给调用方，由界面提示仅本次有效', () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
      removeItem: () => undefined
    };
    expect(() => saveDisplayPreferences(full, defaultDisplayPreferences)).toThrow('quota');
  });

  it('重置会删除保存项，之后读到默认值', () => {
    const storage = memory();
    saveDisplayPreferences(storage, { pageWidth: 'full', cardSize: 'small', align: 'start' });
    clearDisplayPreferences(storage);
    expect(storage.data.has(displayStorageKey)).toBe(false);
    expect(readDisplayPreferences(storage)).toEqual(defaultDisplayPreferences);
  });

  it('判断是否仍是默认设置', () => {
    expect(isDefaultDisplay(defaultDisplayPreferences)).toBe(true);
    expect(isDefaultDisplay({ ...defaultDisplayPreferences, cardSize: 'large' })).toBe(false);
    expect(isDefaultDisplay({ ...defaultDisplayPreferences, align: 'start' })).toBe(false);
    expect(isDefaultDisplay({ ...defaultDisplayPreferences, pageWidth: 'full' })).toBe(false);
  });
});
