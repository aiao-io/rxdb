import { describe, expect, it } from 'vitest';

import { ALL_ROWS_LIMIT, clampPage, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, pageCount } from './paging';

describe('pageCount', () => {
  it('一行都没有时仍然是 1 页——「第 1 / 0 页」不是个能显示的东西', () => {
    expect(pageCount(0, 50)).toBe(1);
  });

  it('整除时不多出一个空页', () => {
    expect(pageCount(250, 50)).toBe(5);
  });

  it('有余数时余数单独占一页', () => {
    expect(pageCount(251, 50)).toBe(6);
  });

  it('不足一页也算一页', () => {
    expect(pageCount(3, 50)).toBe(1);
  });

  it('页长选「全部」时种子数据只有一页', () => {
    expect(pageCount(250, ALL_ROWS_LIMIT)).toBe(1);
  });
});

describe('clampPage', () => {
  it('在范围内的请求页原样返回', () => {
    expect(clampPage(2, 250, 50)).toBe(2);
  });

  it('负数夹到首页', () => {
    expect(clampPage(-1, 250, 50)).toBe(0);
  });

  /*
   * 「越界一页」是新建之后的跳转手法：`create()` 把请求页设成**当前**页数，
   * 那必然大于最大下标一格，于是总数刷新后自动落在真末页上。
   * 少了这条，排序是 `updatedAt asc` 的列表会出现「新建成功但页面没变化」。
   */
  it('越界的请求页夹到末页', () => {
    expect(clampPage(5, 250, 50)).toBe(4);
    expect(clampPage(99, 250, 50)).toBe(4);
  });

  it('页长变大之后旧页码自动收缩', () => {
    expect(clampPage(4, 250, 100)).toBe(2);
  });

  it('数据被清空后回到首页', () => {
    expect(clampPage(4, 0, 50)).toBe(0);
  });
});

describe('页长选项', () => {
  it('「全部」不是哨兵值，就是本地读的上限本身', () => {
    expect(PAGE_SIZE_OPTIONS.at(-1)).toEqual({ label: '全部', value: ALL_ROWS_LIMIT });
  });

  it('默认页长必须是选项之一，否则 select 会显示成空', () => {
    expect(PAGE_SIZE_OPTIONS.map(option => option.value)).toContain(DEFAULT_PAGE_SIZE);
  });
});
