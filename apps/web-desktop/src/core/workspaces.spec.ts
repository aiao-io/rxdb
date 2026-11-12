import { describe, expect, it } from 'vitest';
import { createState } from './state.js';
import { reorderWorkspaces } from './workspaces.js';

describe('DESKTOP-US-107/AC1 工作区排序', () => {
  function state() {
    const value = createState('windows');
    value.workspaces.push({ id: 'writing', name: '写作' }, { id: 'reference', name: '参考' });
    value.navigation.activeWindows = { first: null, writing: null, reference: null };
    value.navigation.workspaceId = 'writing';
    return value;
  }

  it('只调整顺序，工作区身份、名称与活动窗口引用保持不变', () => {
    const value = state();
    const [first, writing, reference] = value.workspaces;
    const navigation = structuredClone(value.navigation);
    reorderWorkspaces(value, ['reference', 'first', 'writing']);
    expect(value.workspaces).toEqual([reference, first, writing]);
    expect(value.workspaces[0]).toBe(reference);
    expect(value.navigation).toEqual(navigation);
  });

  it.each([
    null,
    {},
    'first',
    [],
    ['first'],
    ['first', 'writing', 'writing'],
    ['first', 'writing', 'unknown'],
    ['first', 'writing', 1],
    ['first', 'writing', 'reference', 'extra']
  ])('拒绝不完整、重复、未知或无效顺序 %j 且不修改状态', order => {
    const value = state();
    const before = structuredClone(value);
    expect(() => reorderWorkspaces(value, order)).toThrow('INVALID');
    expect(value).toEqual(before);
  });

  it('仅一个工作区或原顺序提交允许，删除/新增后过期顺序拒绝', () => {
    const value = createState('windows');
    reorderWorkspaces(value, ['first']);
    expect(value.workspaces[0].id).toBe('first');
    const previous = state();
    previous.workspaces.pop();
    expect(() => reorderWorkspaces(previous, ['reference', 'first', 'writing'])).toThrow('INVALID');
  });
});
