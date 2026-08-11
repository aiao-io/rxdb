import { describe, expect, it } from 'vitest';

import { searchOptionsEqual } from '../../core/options-equality.js';

describe('searchOptionsEqual', () => {
  it('同一引用相等', () => {
    const options = { debounce: 300 };
    expect(searchOptionsEqual(options, options)).toBe(true);
  });

  it('两侧都是 undefined 时相等', () => {
    expect(searchOptionsEqual(undefined, undefined)).toBe(true);
  });

  it('只有一侧是 undefined 时不等', () => {
    expect(searchOptionsEqual(undefined, {})).toBe(false);
    expect(searchOptionsEqual({}, undefined)).toBe(false);
  });

  it('语义相同的不同字面量对象相等', () => {
    expect(
      searchOptionsEqual(
        { collections: ['Todo', 'Article'], debounce: 300, pageSize: 20, snippetLength: 120 },
        { collections: ['Todo', 'Article'], debounce: 300, pageSize: 20, snippetLength: 120 }
      )
    ).toBe(true);
  });

  it.each([
    ['debounce', { debounce: 300 }, { debounce: 100 }],
    ['pageSize', { pageSize: 20 }, { pageSize: 50 }],
    ['snippetLength', { snippetLength: 120 }, { snippetLength: 80 }],
    ['collections 内容', { collections: ['Todo'] }, { collections: ['Article'] }],
    ['collections 长度', { collections: ['Todo'] }, { collections: ['Todo', 'Article'] }],
    ['collections 顺序', { collections: ['Todo', 'Article'] }, { collections: ['Article', 'Todo'] }],
    ['collections 有无', { collections: ['Todo'] }, {}]
  ])('%s 不同则不等', (_label, left, right) => {
    expect(searchOptionsEqual(left, right)).toBe(false);
  });

  /**
   * 这是本函数存在的**核心原因**，不是一条边界用例。
   *
   * 三端绑定的重建契约是「重建时保留用户当前 query」，`initialQuery` 因此
   * **只在首次创建时**用作种子，重建时一律被当前 query 覆盖。
   * 若它仍参与相等判断，调用方为了给新 handle 播种而写
   * `useSearch(db, { initialQuery: query, ... })` 就会**每敲一个键重建一次 handle**，
   * 防抖与分页全废 —— 这正是 SRCHR-001 记的「两条路都不通」的第二条。
   *
   * 见 SRCHR-001 / SRCHV-004 / SRA-008。
   */
  it('initialQuery 不参与判断：只有它不同时仍然相等', () => {
    expect(
      searchOptionsEqual(
        { collections: ['Todo'], initialQuery: '', pageSize: 20 },
        { collections: ['Todo'], initialQuery: '用户打到一半的词', pageSize: 20 }
      )
    ).toBe(true);
  });

  it('initialQuery 不参与判断，但同对象里的其他字段照常参与', () => {
    expect(searchOptionsEqual({ initialQuery: 'a', pageSize: 20 }, { initialQuery: 'b', pageSize: 50 })).toBe(false);
  });
});
