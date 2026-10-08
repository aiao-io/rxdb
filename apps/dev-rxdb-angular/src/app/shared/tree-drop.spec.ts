import { describe, expect, it } from 'vitest';
import { resolveTreeDrop, treeDropPosition, type TreeDropInput } from './tree-drop';

/** 默认输入：手动模式，把 D 放到 B 之前；组为 A B C D，D 与 B 都在根组。 */
const makeInput = (patch: Partial<TreeDropInput<string>> = {}): TreeDropInput<string> => ({
  movedId: 'D',
  target: { id: 'B', parentId: null, isFolder: true },
  position: 'before',
  manual: true,
  movedParentId: null,
  isTargetInMovedSubtree: false,
  groupIds: ['A', 'B', 'C', 'D'],
  ...patch
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
    // 不读目标的子节点：groupIds 给空也一样
    const decision = resolveTreeDrop(makeInput({ position: 'into', groupIds: [] }));

    expect(decision).toEqual({ kind: 'reorder', target: { group: { parentId: 'B' } } });
  });

  it('非手动模式拖进当前父文件夹 → reject', () => {
    const decision = resolveTreeDrop(makeInput({ position: 'into', manual: false, movedParentId: 'B' }));

    expect(decision).toEqual({ kind: 'reject' });
  });

  it('非手动模式拖进文件夹 → 追加到该文件夹末尾', () => {
    const decision = resolveTreeDrop(makeInput({ position: 'into', manual: false, movedParentId: 'F' }));

    expect(decision).toEqual({ kind: 'reorder', target: { group: { parentId: 'B' } } });
  });

  it('非手动模式把非根级节点拖到根级节点上下方 → 追加到根组末尾', () => {
    for (const position of ['before', 'after'] as const) {
      const decision = resolveTreeDrop(makeInput({ position, manual: false, movedParentId: 'F' }));

      expect(decision).toEqual({ kind: 'reorder', target: { group: { parentId: null } } });
    }
  });

  it('非手动模式其余前后放置 → reject', () => {
    for (const position of ['before', 'after'] as const) {
      // 根级节点之间
      expect(resolveTreeDrop(makeInput({ position, manual: false }))).toEqual({ kind: 'reject' });
      // 非根级目标：同级与跨级都拒
      const nested = { id: 'B', parentId: 'F', isFolder: true };
      expect(resolveTreeDrop(makeInput({ position, manual: false, target: nested, movedParentId: 'F' }))).toEqual({
        kind: 'reject'
      });
      expect(resolveTreeDrop(makeInput({ position, manual: false, target: nested, movedParentId: 'G' }))).toEqual({
        kind: 'reject'
      });
    }
  });

  it('手动模式原位放下 → noop', () => {
    // D 本来就在 C 之后：放到 C 之后、放到组尾都是原位
    expect(
      resolveTreeDrop(makeInput({ position: 'after', target: { id: 'C', parentId: null, isFolder: true } }))
    ).toEqual({ kind: 'noop' });
    expect(resolveTreeDrop(makeInput({ position: 'before', movedId: 'A' }))).toEqual({ kind: 'noop' });
  });

  it('手动模式前后放置 → 邻居目标', () => {
    expect(resolveTreeDrop(makeInput({ position: 'before' }))).toEqual({
      kind: 'reorder',
      target: { prevId: 'A', nextId: 'B' }
    });
    expect(resolveTreeDrop(makeInput({ position: 'after' }))).toEqual({
      kind: 'reorder',
      target: { prevId: 'B', nextId: 'C' }
    });
    // 跨组：被拖节点不在目标组里
    const crossGroup = makeInput({
      movedId: 'P1',
      movedParentId: 'P',
      target: { id: 'Q1', parentId: 'Q', isFolder: true },
      position: 'after',
      groupIds: ['Q1', 'Q2']
    });
    expect(resolveTreeDrop(crossGroup)).toEqual({ kind: 'reorder', target: { prevId: 'Q1', nextId: 'Q2' } });
  });
});

describe('treeDropPosition', () => {
  const manual = { manual: true, targetIsRoot: false };

  it('上三分之一为 before', () => {
    expect(treeDropPosition(0, 90, manual)).toBe('before');
    expect(treeDropPosition(29.9, 90, manual)).toBe('before');
  });

  it('下三分之一为 after', () => {
    expect(treeDropPosition(60.1, 90, manual)).toBe('after');
    expect(treeDropPosition(90, 90, manual)).toBe('after');
  });

  it('中间为 into', () => {
    expect(treeDropPosition(30, 90, manual)).toBe('into');
    expect(treeDropPosition(45, 90, manual)).toBe('into');
    expect(treeDropPosition(60, 90, manual)).toBe('into');
  });

  it('非手动模式非根级行整行为 into', () => {
    for (const offsetY of [0, 45, 90]) {
      expect(treeDropPosition(offsetY, 90, { manual: false, targetIsRoot: false })).toBe('into');
    }
  });

  it('非手动模式根级行仍分三档', () => {
    const ctx = { manual: false, targetIsRoot: true };

    expect(treeDropPosition(5, 90, ctx)).toBe('before');
    expect(treeDropPosition(45, 90, ctx)).toBe('into');
    expect(treeDropPosition(85, 90, ctx)).toBe('after');
  });
});
