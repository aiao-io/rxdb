import { describe, expect, it } from 'vitest';
import { isTargetInMovedSubtree, resolveTreeDrop, type TreeDropInput, treeDropPosition } from './useDragDropService';

/** 默认：手动模式、被拖节点 D 在根组 [A, B, C, D]，目标 B（根级文件夹）。 */
const makeInput = (overrides: Partial<TreeDropInput<string>> = {}): TreeDropInput<string> => ({
  movedId: 'D',
  target: { id: 'B', parentId: null, isFolder: true },
  position: 'before',
  manual: true,
  movedParentId: null,
  isTargetInMovedSubtree: false,
  groupIds: ['A', 'B', 'C', 'D'],
  ...overrides
});

describe('resolveTreeDrop', () => {
  it('目标是被拖节点自己或后代 → reject', () => {
    for (const position of ['before', 'after', 'into'] as const) {
      expect(resolveTreeDrop(makeInput({ position, isTargetInMovedSubtree: true }))).toEqual({ kind: 'reject' });
    }
  });

  it('拖进文件 → reject', () => {
    const input = makeInput({ position: 'into', target: { id: 'B', parentId: null, isFolder: false } });
    expect(resolveTreeDrop(input)).toEqual({ kind: 'reject' });
    expect(resolveTreeDrop({ ...input, manual: false })).toEqual({ kind: 'reject' });
  });

  it('手动模式拖进节点 → 追加到该节点子组末尾', () => {
    expect(resolveTreeDrop(makeInput({ position: 'into' }))).toEqual({
      kind: 'reorder',
      target: { group: { parentId: 'B' } }
    });
    // 拖进当前父节点在手动模式也是追加到末尾（已是末尾时由引擎零写）
    expect(resolveTreeDrop(makeInput({ position: 'into', movedParentId: 'B' }))).toEqual({
      kind: 'reorder',
      target: { group: { parentId: 'B' } }
    });
  });

  it('非手动模式拖进当前父文件夹 → reject', () => {
    expect(resolveTreeDrop(makeInput({ manual: false, position: 'into', movedParentId: 'B' }))).toEqual({
      kind: 'reject'
    });
  });

  it('非手动模式拖进文件夹 → 追加到该文件夹末尾', () => {
    expect(resolveTreeDrop(makeInput({ manual: false, position: 'into' }))).toEqual({
      kind: 'reorder',
      target: { group: { parentId: 'B' } }
    });
  });

  it('非手动模式把非根级节点拖到根级节点上下方 → 追加到根组末尾', () => {
    for (const position of ['before', 'after'] as const) {
      expect(resolveTreeDrop(makeInput({ manual: false, position, movedParentId: 'P' }))).toEqual({
        kind: 'reorder',
        target: { group: { parentId: null } }
      });
    }
  });

  it('非手动模式其余前后放置 → reject', () => {
    // 根级节点之间
    expect(resolveTreeDrop(makeInput({ manual: false, position: 'after' }))).toEqual({ kind: 'reject' });
    // 同一父节点下的非根级节点之间
    const sibling = makeInput({
      manual: false,
      position: 'before',
      movedParentId: 'P',
      target: { id: 'x', parentId: 'P', isFolder: false }
    });
    expect(resolveTreeDrop(sibling)).toEqual({ kind: 'reject' });
    // 非根级目标：即使被拖节点在别的父节点下，也不是移到根级
    expect(resolveTreeDrop({ ...sibling, movedParentId: 'Q' })).toEqual({ kind: 'reject' });
  });

  it('手动模式原位放下 → noop', () => {
    // D 本就在 C 之后：放到 C 的下方、放到 A 之前的 groupIds 起点同理
    expect(
      resolveTreeDrop(makeInput({ position: 'after', target: { id: 'C', parentId: null, isFolder: true } }))
    ).toEqual({ kind: 'noop' });
  });

  it('手动模式前后放置 → 邻居目标', () => {
    expect(resolveTreeDrop(makeInput({ position: 'before' }))).toEqual({
      kind: 'reorder',
      target: { prevId: 'A', nextId: 'B' }
    });
    expect(
      resolveTreeDrop(
        makeInput({ position: 'after', target: { id: 'D', parentId: null, isFolder: true }, movedId: 'A' })
      )
    ).toEqual({
      kind: 'reorder',
      target: { prevId: 'D', nextId: null }
    });
    // 跨父：被拖节点不在目标组里
    expect(
      resolveTreeDrop(
        makeInput({
          position: 'after',
          movedId: 'p1',
          movedParentId: 'P',
          target: { id: 'q1', parentId: 'Q', isFolder: true },
          groupIds: ['q1', 'q2']
        })
      )
    ).toEqual({ kind: 'reorder', target: { prevId: 'q1', nextId: 'q2' } });
  });
});

describe('treeDropPosition', () => {
  const manual = { manual: true, targetIsRoot: false };

  it('上三分之一为 before', () => {
    expect(treeDropPosition(0, 30, manual)).toBe('before');
    expect(treeDropPosition(9.9, 30, manual)).toBe('before');
  });

  it('下三分之一为 after', () => {
    expect(treeDropPosition(20.1, 30, manual)).toBe('after');
    expect(treeDropPosition(30, 30, manual)).toBe('after');
  });

  it('中间为 into', () => {
    expect(treeDropPosition(10, 30, manual)).toBe('into');
    expect(treeDropPosition(15, 30, manual)).toBe('into');
    expect(treeDropPosition(20, 30, manual)).toBe('into');
  });

  it('非手动模式非根级行整行为 into', () => {
    const ctx = { manual: false, targetIsRoot: false };
    expect(treeDropPosition(1, 30, ctx)).toBe('into');
    expect(treeDropPosition(15, 30, ctx)).toBe('into');
    expect(treeDropPosition(29, 30, ctx)).toBe('into');
  });

  it('非手动模式根级行仍分三档', () => {
    const ctx = { manual: false, targetIsRoot: true };
    expect(treeDropPosition(1, 30, ctx)).toBe('before');
    expect(treeDropPosition(15, 30, ctx)).toBe('into');
    expect(treeDropPosition(29, 30, ctx)).toBe('after');
  });
});

describe('isTargetInMovedSubtree', () => {
  const items = [
    { id: 'root', parentId: null },
    { id: 'child', parentId: 'root' },
    { id: 'grand', parentId: 'child' },
    { id: 'other', parentId: null }
  ];

  it('目标是被拖节点自己', () => {
    expect(isTargetInMovedSubtree('root', items[0], items)).toBe(true);
  });

  it('目标是被拖节点的后代', () => {
    expect(isTargetInMovedSubtree('root', items[2], items)).toBe(true);
  });

  it('目标是祖先或无关节点', () => {
    expect(isTargetInMovedSubtree('grand', items[0], items)).toBe(false);
    expect(isTargetInMovedSubtree('root', items[3], items)).toBe(false);
  });
});
