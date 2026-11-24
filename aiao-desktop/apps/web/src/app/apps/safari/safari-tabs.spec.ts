import { describe, expect, it } from 'vitest';

import { SafariTab, blankTab, moveTab, setTabPinned } from './safari-tabs';

const tab = (url: string, pinned = false): SafariTab => ({ url, history: [url], index: 0, pinned });

const urls = (tabs: readonly SafariTab[]): string[] => tabs.map(item => item.url);

describe('moveTab 拖动重排', () => {
  it('向后拖：from 0 到 2 插到第 2 位前', () => {
    expect(urls(moveTab([tab('a'), tab('b'), tab('c')], 0, 2))).toEqual(['b', 'a', 'c']);
  });

  it('向前拖：from 2 到 0', () => {
    expect(urls(moveTab([tab('a'), tab('b'), tab('c')], 2, 0))).toEqual(['c', 'a', 'b']);
  });

  it('固定标签拖不出固定区，普通标签越不进固定区', () => {
    const tabs = [tab('p1', true), tab('p2', true), tab('a'), tab('b')];
    expect(urls(moveTab(tabs, 1, 3))).toEqual(['p1', 'p2', 'a', 'b']);
    expect(urls(moveTab(tabs, 2, 0))).toEqual(['p1', 'p2', 'a', 'b']);
    expect(urls(moveTab(tabs, 3, 2))).toEqual(['p1', 'p2', 'b', 'a']);
  });

  it('原位或越界不改变顺序', () => {
    const tabs = [tab('a'), tab('b')];
    expect(moveTab(tabs, 0, 0)).toBe(tabs);
    expect(moveTab(tabs, -1, 0)).toBe(tabs);
    expect(urls(moveTab(tabs, 0, 9))).toEqual(['a', 'b']);
  });

  it('其余标签保持对象身份', () => {
    const tabs = [tab('a'), tab('b'), tab('c')];
    const next = moveTab(tabs, 0, 2);
    expect(next[0]).toBe(tabs[1]);
    expect(next[1]).toBe(tabs[0]);
    expect(next[2]).toBe(tabs[2]);
  });
});

describe('setTabPinned 固定标签', () => {
  it('固定后落到固定区末尾，其他标签顺序不变', () => {
    const tabs = [tab('p', true), tab('a'), tab('b')];
    expect(urls(setTabPinned(tabs, 2, true))).toEqual(['p', 'b', 'a']);
  });

  it('取消固定后落到普通区开头', () => {
    const tabs = [tab('p1', true), tab('p2', true), tab('a')];
    expect(urls(setTabPinned(tabs, 0, false))).toEqual(['p2', 'p1', 'a']);
  });

  it('其余标签保持对象身份，被切换的标签换成新对象', () => {
    const tabs = [tab('a'), tab('b')];
    const next = setTabPinned(tabs, 0, true);
    expect(next[1]).toBe(tabs[1]);
    expect(next[0]).not.toBe(tabs[0]);
  });

  it('状态相同或越界原样返回', () => {
    const tabs = [tab('p', true)];
    expect(setTabPinned(tabs, 0, true)).toBe(tabs);
    expect(setTabPinned(tabs, -1, true)).toBe(tabs);
  });

  it('blankTab 默认不固定', () => {
    expect(blankTab().pinned).toBe(false);
  });
});
