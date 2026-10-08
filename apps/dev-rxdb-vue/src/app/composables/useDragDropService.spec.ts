import { describe, expect, it } from 'vitest';
import { resolveTreeDrop, treeDropPosition, type TreeDropInput } from './useDragDropService';

/**
 * 判定表（`specs/009-us031-tree-drag-reorder/contracts/demo-drag-drop.md` §1）逐行断言，
 * 与 Angular / React 两端的同名用例逐字对齐。
 */

/** 默认输入：手动模式，A 在根组 [A, B, C] 里，拖 A 到根级的 C 上。 */
const input = (overrides: Partial<TreeDropInput<string>> = {}): TreeDropInput<string> => ({
  movedId: 'A',
  target: { id: 'C', parentId: null, isFolder: true },
  position: 'after',
  manual: true,
  movedParentId: null,
  isTargetInMovedSubtree: false,
  groupIds: ['A', 'B', 'C'],
  ...overrides
});

describe('resolveTreeDrop', () => {
  it('目标是被拖节点自己或后代 → reject', () => {
    expect(resolveTreeDrop(input({ isTargetInMovedSubtree: true, position: 'before' }))).toEqual({ kind: 'reject' });
    expect(resolveTreeDrop(input({ isTargetInMovedSubtree: true, position: 'into' }))).toEqual({ kind: 'reject' });
    expect(resolveTreeDrop(input({ isTargetInMovedSubtree: true, manual: false }))).toEqual({ kind: 'reject' });
  });

  it('拖进文件 → reject', () => {
    const decision = resolveTreeDrop(input({ position: 'into', target: { id: 'C', parentId: null, isFolder: false } }));

    expect(decision).toEqual({ kind: 'reject' });
  });

  it('手动模式拖进节点 → 追加到该节点子组末尾', () => {
    const decision = resolveTreeDrop(input({ position: 'into', target: { id: 'C', parentId: null, isFolder: true } }));

    expect(decision).toEqual({ kind: 'reorder', target: { group: { parentId: 'C' } } });
  });

  it('非手动模式拖进当前父文件夹 → reject', () => {
    const decision = resolveTreeDrop(
      input({
        manual: false,
        position: 'into',
        movedParentId: 'P',
        target: { id: 'P', parentId: null, isFolder: true }
      })
    );

    expect(decision).toEqual({ kind: 'reject' });
  });

  it('非手动模式拖进文件夹 → 追加到该文件夹末尾', () => {
    const decision = resolveTreeDrop(
      input({
        manual: false,
        position: 'into',
        movedParentId: 'P',
        target: { id: 'F', parentId: null, isFolder: true }
      })
    );

    expect(decision).toEqual({ kind: 'reorder', target: { group: { parentId: 'F' } } });
  });

  it('非手动模式把非根级节点拖到根级节点上下方 → 追加到根组末尾', () => {
    for (const position of ['before', 'after'] as const) {
      const decision = resolveTreeDrop(
        input({
          manual: false,
          position,
          movedParentId: 'P',
          target: { id: 'C', parentId: null, isFolder: false }
        })
      );

      expect(decision).toEqual({ kind: 'reorder', target: { group: { parentId: null } } });
    }
  });

  it('非手动模式其余前后放置 → reject', () => {
    // 根级节点之间
    expect(resolveTreeDrop(input({ manual: false, position: 'before' }))).toEqual({ kind: 'reject' });
    // 同级（目标不在根级）
    expect(
      resolveTreeDrop(
        input({
          manual: false,
          position: 'after',
          movedParentId: 'P',
          target: { id: 'C', parentId: 'P', isFolder: false }
        })
      )
    ).toEqual({ kind: 'reject' });
    // 非根级节点之间的跨父放置
    expect(
      resolveTreeDrop(
        input({
          manual: false,
          position: 'before',
          movedParentId: 'P',
          target: { id: 'C', parentId: 'Q', isFolder: false }
        })
      )
    ).toEqual({ kind: 'reject' });
  });

  it('手动模式原位放下 → noop', () => {
    // A 已在 B 之前：放在 B 前面 = 原位
    const decision = resolveTreeDrop(
      input({ position: 'before', target: { id: 'B', parentId: null, isFolder: true } })
    );

    expect(decision).toEqual({ kind: 'noop' });
  });

  it('手动模式前后放置 → 邻居目标', () => {
    const after = resolveTreeDrop(input({ position: 'after', target: { id: 'C', parentId: null, isFolder: true } }));
    const before = resolveTreeDrop(input({ position: 'before', target: { id: 'C', parentId: null, isFolder: true } }));

    expect(after).toEqual({ kind: 'reorder', target: { prevId: 'C', nextId: null } });
    expect(before).toEqual({ kind: 'reorder', target: { prevId: 'B', nextId: 'C' } });
  });
});

describe('treeDropPosition', () => {
  const manual = { manual: true, targetIsRoot: false };

  it('上三分之一为 before', () => {
    expect(treeDropPosition(0, 30, manual)).toBe('before');
    expect(treeDropPosition(9.9, 30, manual)).toBe('before');
    // 边界：恰在 height / 3 处不属于 before
    expect(treeDropPosition(10, 30, manual)).toBe('into');
  });

  it('下三分之一为 after', () => {
    expect(treeDropPosition(30, 30, manual)).toBe('after');
    expect(treeDropPosition(20.1, 30, manual)).toBe('after');
    // 边界：恰在 height * 2 / 3 处不属于 after
    expect(treeDropPosition(20, 30, manual)).toBe('into');
  });

  it('中间为 into', () => {
    expect(treeDropPosition(15, 30, manual)).toBe('into');
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
