import type { ITreeEntity, RxDBEntityId, UUID } from '@aiao/rxdb';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDragDrop } from './useDragDrop';

interface TestNode extends ITreeEntity {
  parentId: UUID | null;
  type: 'file' | 'folder';
  sortOrder?: string | null;
  save?: () => Promise<void>;
}

const toUuid = (id: string): UUID => `${id}-0000-0000-0000-000000000000`;
const makeNode = (id: string, parentId: string | null, type: TestNode['type']): TestNode => ({
  id: toUuid(id),
  parentId: parentId === null ? null : toUuid(parentId),
  type,
  createdAt: new Date(0),
  updatedAt: new Date(0)
});

const makeSortableNode = (
  id: string,
  parentId: string | null,
  type: TestNode['type'],
  sortOrder: string
): TestNode => ({
  ...makeNode(id, parentId, type),
  sortOrder,
  save: () => Promise.resolve()
});

describe('useDragDrop', () => {
  /**
   * 页面把 `useDragDrop` 的返回值传给被 memo 的行组件。
   * 只要 handler 每次 render 都换新身份，memo 就被击穿 —— 整棵树跟着 rerender。
   */
  it('输入不变时，返回的 handler 身份必须跨 render 保持稳定', () => {
    const items = [makeNode('a', null, 'folder'), makeNode('b', null, 'file')];
    const isFolder = (node: TestNode): boolean => node.type === 'folder';

    const { result, rerender } = renderHook(() => useDragDrop<TestNode>(items, { isFolder }));
    const first = result.current;

    rerender();

    expect(result.current.onDragOver).toBe(first.onDragOver);
    expect(result.current.onDrop).toBe(first.onDrop);
  });

  it('不传 options 时同样要稳定（默认值不能每次都是新对象）', () => {
    const items = [makeNode('a', null, 'folder')];

    const { result, rerender } = renderHook(() => useDragDrop<TestNode>(items));
    const first = result.current;

    rerender();

    expect(result.current.onDragOver).toBe(first.onDragOver);
  });

  /**
   * APP-dev-rxdb-react P0-1。
   *
   * 懒加载页面此前给 `useDragDrop` 灌的是**全表订阅**结果，理由是"拖放要拿到所有节点"。
   * 真实需要的只有两样：
   *
   * 1. **目标的祖先链** —— 用来判环。懒树里能被拖到的节点必然可见，
   *    而要可见就必须逐级展开过它的祖先，所以祖先链**永远已经在可见集合里**，
   *    无需全表。
   * 2. **落点的同级列表** —— 用来算 `sortOrder`。这份是懒树里**真的可能没加载**的，
   *    必须按需查（`resolveSiblings`），而不是靠订阅整张表顺带拿到。
   *
   * 下面两条锁死这个边界：拿不到同级 = 算出撞车的排序键；祖先链只能来自可见集合。
   */
  describe('有界作用域（P0-1）', () => {
    it('拖入未展开的文件夹时，必须按需取同级，否则排序键与既有子节点撞车', async () => {
      const folder = makeSortableNode('f', null, 'folder', 'a0');
      const dragged = makeSortableNode('d', null, 'file', 'a1');
      // 已在库里、但因为 folder 未展开而不在可见集合中的两个子节点。
      const hiddenChildren = [makeSortableNode('c1', 'f', 'file', 'a0'), makeSortableNode('c2', 'f', 'file', 'a1')];
      const resolveSiblings = vi.fn((parentId: RxDBEntityId | null) =>
        Promise.resolve(parentId === folder.id ? hiddenChildren : [])
      );

      const { result } = renderHook(() =>
        useDragDrop<TestNode>([folder, dragged], {
          isFolder: node => node.type === 'folder',
          resolveSiblings
        })
      );

      act(() => result.current.onDragStart(dragged.id));
      act(() => {
        // 行高 30，鼠标落在正中 → 'into'
        result.current.onDragOver(folder, 15, { top: 0, height: 30 } as DOMRect);
      });
      await act(async () => {
        await result.current.onDrop(folder);
      });

      expect(resolveSiblings).toHaveBeenCalledWith(folder.id);
      expect(dragged.parentId).toBe(folder.id);
      // 必须排在既有最后一个子节点 'a1' 之后；只看可见集合会算出 'a0'，与 c1 撞车。
      expect(dragged.sortOrder! > 'a1').toBe(true);
    });

    it('判环只用可见集合，不得为此额外发查询', async () => {
      // parent → child，两者都可见；把 parent 拖进自己的 child 必须被拒。
      const parent = makeSortableNode('p', null, 'folder', 'a0');
      const child = makeSortableNode('c', 'p', 'folder', 'a0');
      const resolveSiblings = vi.fn(() => Promise.resolve([] as TestNode[]));

      const { result } = renderHook(() =>
        useDragDrop<TestNode>([parent, child], {
          isFolder: node => node.type === 'folder',
          resolveSiblings
        })
      );

      act(() => result.current.onDragStart(parent.id));
      let validity = { isValid: true };
      act(() => {
        validity = result.current.onDragOver(child, 15, { top: 0, height: 30 } as DOMRect);
      });

      expect(validity.isValid).toBe(false);
      expect(resolveSiblings).not.toHaveBeenCalled();
    });
  });
});
