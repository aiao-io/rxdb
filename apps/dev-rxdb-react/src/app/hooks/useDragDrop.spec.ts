import { type RxDBEntityId, SortOrderError, type UUID } from '@aiao/rxdb';
import type { ITreeEntity } from '@aiao/rxdb-plugin-tree';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type DragDropOptions, useDragDrop } from './useDragDrop';
import { useTreeWriteError } from './useTreeWriteError';

interface TestNode extends ITreeEntity {
  parentId: UUID | null;
  type: 'file' | 'folder';
}

const toUuid = (id: string): UUID => `${id}-0000-0000-0000-000000000000`;
const makeNode = (id: string, parentId: string | null, type: TestNode['type']): TestNode => ({
  id: toUuid(id),
  parentId: parentId === null ? null : toUuid(parentId),
  type,
  createdAt: new Date(0),
  updatedAt: new Date(0)
});

const isFolder = (node: TestNode): boolean => node.type === 'folder';

/** 行高 30：y=2 落在上三分之一（before），y=15 在中间（into），y=28 在下三分之一（after）。 */
const ROW_RECT = { top: 0, height: 30 } as DOMRect;

/** 页面的接法：`runWrite` 来自 `useTreeWriteError`，失败文案由页内提示读 `writeError`。 */
const useHarness = (items: TestNode[], options: Omit<DragDropOptions<TestNode>, 'runWrite'>) => {
  const { writeError, runWrite } = useTreeWriteError();
  const dragDrop = useDragDrop<TestNode>(items, { ...options, runWrite });
  return { ...dragDrop, writeError };
};

const makeRepository = () => ({ reorder: vi.fn((_id: RxDBEntityId, _target: unknown) => Promise.resolve()) });

type Harness = ReturnType<typeof renderHook<ReturnType<typeof useHarness>, unknown>>['result'];

/** 一次完整的拖放：起拖 → 悬停到目标行的 y 处 → 放下。 */
const dragAndDrop = async (
  result: Harness,
  dragged: TestNode,
  target: TestNode,
  y: number,
  onExpandFolder?: (id: string) => void
) => {
  act(() => result.current.onDragStart(dragged.id));
  act(() => {
    result.current.onDragOver(target, y, ROW_RECT);
  });
  await act(async () => {
    await result.current.onDrop(target, onExpandFolder);
  });
};

const IDLE_STATE = { draggedItemId: null, targetItemId: null, dropMode: null, isValidTarget: false };

describe('useDragDrop', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * 页面把 `useDragDrop` 的返回值传给被 memo 的行组件。
   * 只要 handler 每次 render 都换新身份，memo 就被击穿 —— 整棵树跟着 rerender。
   */
  it('输入不变时，返回的 handler 身份必须跨 render 保持稳定', () => {
    const items = [makeNode('a', null, 'folder'), makeNode('b', null, 'file')];
    const repository = makeRepository();

    const { result, rerender } = renderHook(() => useHarness(items, { isFolder, repository }));
    const first = result.current;

    rerender();

    expect(result.current.onDragOver).toBe(first.onDragOver);
    expect(result.current.onDrop).toBe(first.onDrop);
  });

  it('只传必需选项时同样要稳定（默认值不能每次都是新对象）', () => {
    const items = [makeNode('a', null, 'folder')];
    const repository = makeRepository();

    const { result, rerender } = renderHook(() => useHarness(items, { repository }));
    const first = result.current;

    rerender();

    expect(result.current.onDragOver).toBe(first.onDragOver);
  });

  describe('缺陷三：拖进与完整组序列', () => {
    it('拖进折叠且子节点未加载的节点：目标为 { group }，不读子节点', async () => {
      const folder = makeNode('f', null, 'folder');
      const dragged = makeNode('d', null, 'file');
      const repository = makeRepository();
      const getGroupIds = vi.fn(() => [] as RxDBEntityId[]);
      const onExpandFolder = vi.fn();

      const { result } = renderHook(() => useHarness([folder, dragged], { isFolder, repository, getGroupIds }));
      await dragAndDrop(result, dragged, folder, 15, onExpandFolder);

      // 折叠节点的子节点没加载：不论库里有几个，都只交给引擎「追加到该组末尾」
      expect(repository.reorder).toHaveBeenCalledTimes(1);
      expect(repository.reorder).toHaveBeenCalledWith(dragged.id, { group: { parentId: folder.id } });
      expect(getGroupIds).not.toHaveBeenCalled();
      expect(onExpandFolder).toHaveBeenCalledWith(folder.id);
      expect(result.current.writeError).toBeNull();
    });

    it('前后放置的邻居取自组的完整序列，不取搜索过滤后的可见行', async () => {
      // 搜索把 B 过滤掉了：可见行只有 A、C、X，但组的完整序列是 A、B、C、X
      const [a, b, c, x] = [
        makeNode('a', null, 'folder'),
        makeNode('b', null, 'folder'),
        makeNode('c', null, 'folder'),
        makeNode('x', null, 'folder')
      ];
      const repository = makeRepository();
      const getGroupIds = vi.fn((parentId: RxDBEntityId | null) => (parentId === null ? [a.id, b.id, c.id, x.id] : []));

      const { result } = renderHook(() => useHarness([a, c, x], { isFolder, repository, getGroupIds }));
      await dragAndDrop(result, x, a, 28);

      expect(getGroupIds).toHaveBeenCalledWith(null);
      // 夹在 A 与 C 之间的 B 不能被漏掉：下一个兄弟是 B，不是可见的 C
      expect(repository.reorder).toHaveBeenCalledWith(x.id, { prevId: a.id, nextId: b.id });
    });

    it('一次性加载的页面不传 getGroupIds：组序列取自传入的全集', async () => {
      const [a, b, c] = [makeNode('a', null, 'folder'), makeNode('b', null, 'folder'), makeNode('c', null, 'folder')];
      const repository = makeRepository();

      const { result } = renderHook(() => useHarness([a, b, c], { isFolder, repository }));
      await dragAndDrop(result, c, a, 28);

      expect(repository.reorder).toHaveBeenCalledWith(c.id, { prevId: a.id, nextId: b.id });
    });
  });

  describe('失败处理', () => {
    it('reorder 抛 SortOrderError 时页内提示「拖放失败：…」、拖拽状态复位、不弹窗', async () => {
      const alertSpy = vi.fn();
      vi.stubGlobal('alert', alertSpy);
      const [a, b] = [makeNode('a', null, 'folder'), makeNode('b', null, 'folder')];
      const repository = makeRepository();
      repository.reorder.mockRejectedValue(new SortOrderError('Menu', 'staleTarget', '邻居已不相邻'));

      const { result } = renderHook(() => useHarness([a, b], { isFolder, repository }));
      await dragAndDrop(result, a, b, 15);

      expect(result.current.writeError).toBe('拖放失败：Menu: 邻居已不相邻');
      expect(result.current.dragDropState).toEqual(IDLE_STATE);
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('放下时 getGroupIds 抛错：进页内提示「拖放失败」，onDrop 不 reject，状态复位', async () => {
      const [a, b] = [makeNode('a', null, 'folder'), makeNode('b', null, 'folder')];
      const repository = makeRepository();
      // 悬停那次判定正常，放下那次抛错
      const getGroupIds = vi
        .fn<(parentId: RxDBEntityId | null) => readonly RxDBEntityId[]>()
        .mockReturnValueOnce([a.id, b.id])
        .mockImplementation(() => {
          throw new Error('父节点的子节点尚未加载');
        });

      const { result } = renderHook(() => useHarness([a, b], { isFolder, repository, getGroupIds }));
      await dragAndDrop(result, b, a, 2);

      expect(repository.reorder).not.toHaveBeenCalled();
      expect(result.current.writeError).toBe('拖放失败：父节点的子节点尚未加载');
      expect(result.current.dragDropState).toEqual(IDLE_STATE);
    });

    it('传入放下事件的坐标时按它重算落点，不沿用 dragover 留在 state 里的 dropMode', async () => {
      const [a, b] = [makeNode('a', null, 'folder'), makeNode('b', null, 'folder')];
      const repository = makeRepository();

      const { result } = renderHook(() => useHarness([a, b], { isFolder, repository }));
      act(() => result.current.onDragStart(b.id));
      act(() => {
        result.current.onDragOver(a, 15, ROW_RECT); // 最后一次 dragover 判为「拖进」
      });
      await act(async () => {
        await result.current.onDrop(a, undefined, { mouseY: 2, rect: ROW_RECT }); // 真正放下时在上沿
      });

      expect(repository.reorder).toHaveBeenCalledOnce();
      expect(repository.reorder).not.toHaveBeenCalledWith(b.id, { group: { parentId: a.id } });
    });

    it('失败时不展开目标文件夹', async () => {
      const [a, b] = [makeNode('a', null, 'folder'), makeNode('b', null, 'folder')];
      const repository = makeRepository();
      repository.reorder.mockRejectedValue(new SortOrderError('Menu', 'notFound', '行不存在'));
      const onExpandFolder = vi.fn();

      const { result } = renderHook(() => useHarness([a, b], { isFolder, repository }));
      await dragAndDrop(result, a, b, 15, onExpandFolder);

      expect(onExpandFolder).not.toHaveBeenCalled();
    });

    it('下一次拖放清空错误', async () => {
      const [a, b, c] = [makeNode('a', null, 'folder'), makeNode('b', null, 'folder'), makeNode('c', null, 'folder')];
      const repository = makeRepository();
      repository.reorder.mockRejectedValueOnce(new SortOrderError('Menu', 'staleTarget', '邻居已不相邻'));

      const { result } = renderHook(() => useHarness([a, b, c], { isFolder, repository }));
      await dragAndDrop(result, a, b, 15);
      expect(result.current.writeError).not.toBeNull();

      await dragAndDrop(result, a, c, 15);

      expect(repository.reorder).toHaveBeenCalledTimes(2);
      expect(result.current.writeError).toBeNull();
    });
  });

  describe('提交前被拒或原位', () => {
    it('reject / noop 不调用 reorder', async () => {
      const parent = makeNode('p', null, 'folder');
      const child = makeNode('c', 'p', 'folder');
      const file = makeNode('f', null, 'file');
      const [a, b, c] = [makeNode('a', null, 'folder'), makeNode('b', null, 'folder'), makeNode('z', null, 'folder')];
      const repository = makeRepository();

      const cycle = renderHook(() => useHarness([parent, child], { isFolder, repository }));
      await dragAndDrop(cycle.result, parent, child, 2); // 前
      await dragAndDrop(cycle.result, parent, child, 28); // 后
      await dragAndDrop(cycle.result, parent, child, 15); // 内
      await dragAndDrop(cycle.result, parent, parent, 15); // 自己

      const intoFile = renderHook(() => useHarness([parent, file], { isFolder, repository }));
      await dragAndDrop(intoFile.result, parent, file, 15);

      // 原位：c 本就在 b 之后、放回 b 的下方
      const inPlace = renderHook(() => useHarness([a, b, c], { isFolder, repository }));
      await dragAndDrop(inPlace.result, c, b, 28);

      expect(repository.reorder).not.toHaveBeenCalled();
      expect(cycle.result.current.dragDropState).toEqual(IDLE_STATE);
      expect(cycle.result.current.writeError).toBeNull();
      expect(inPlace.result.current.dragDropState).toEqual(IDLE_STATE);
    });

    it('被拒的落点高亮为无效，放得下的落点为有效', () => {
      const parent = makeNode('p', null, 'folder');
      const child = makeNode('c', 'p', 'folder');
      const other = makeNode('o', null, 'folder');
      const repository = makeRepository();

      const { result } = renderHook(() => useHarness([parent, child, other], { isFolder, repository }));
      act(() => result.current.onDragStart(parent.id));
      let toChild = { isValid: true };
      let toOther = { isValid: false };
      act(() => {
        toChild = result.current.onDragOver(child, 15, ROW_RECT);
      });
      act(() => {
        toOther = result.current.onDragOver(other, 15, ROW_RECT);
      });

      expect(toChild.isValid).toBe(false);
      expect(toOther.isValid).toBe(true);
    });

    it('手动模式拖进当前父节点：交给引擎追加到该组末尾（不再一律不动）', async () => {
      const parent = makeNode('p', null, 'folder');
      const first = makeNode('c1', 'p', 'file');
      const second = makeNode('c2', 'p', 'file');
      const repository = makeRepository();

      const { result } = renderHook(() => useHarness([parent, first, second], { isFolder, repository }));
      await dragAndDrop(result, first, parent, 15);

      expect(repository.reorder).toHaveBeenCalledWith(first.id, { group: { parentId: parent.id } });
    });
  });

  describe('竞态：上一次拖放的写入未完成时开始下一次拖放', () => {
    it('上一次 drop 迟到的复位不能抹掉新一次拖放已建立的状态', async () => {
      const [a, b, c] = [makeNode('a', null, 'folder'), makeNode('b', null, 'folder'), makeNode('c', null, 'folder')];
      const repository = makeRepository();
      let resolveReorder!: () => void;
      // 第一次拖放的引擎写入挂起（CI 上 OPFS 事务可能慢到百毫秒级，期间用户已开始下一次拖放）
      repository.reorder.mockReturnValue(
        new Promise<void>(resolve => {
          resolveReorder = resolve;
        })
      );

      const { result } = renderHook(() => useHarness([a, b, c], { isFolder, repository }));

      // 第一次拖放：b 拖进 a，放下后写入挂起
      act(() => result.current.onDragStart(b.id));
      act(() => {
        result.current.onDragOver(a, 15, ROW_RECT);
      });
      let firstDrop!: Promise<unknown>;
      act(() => {
        firstDrop = result.current.onDrop(a);
      });

      // 第二次拖放开始：c 拖到 a 的上沿，状态已建立
      act(() => result.current.onDragStart(c.id));
      act(() => {
        result.current.onDragOver(a, 2, ROW_RECT);
      });
      expect(result.current.dragDropState.draggedItemId).toBe(c.id);
      expect(result.current.dragDropState.targetItemId).toBe(a.id);

      // 第一次的写入这时才完成：它的复位只该清它自己的拖放，不能抹掉第二次的
      act(() => resolveReorder());
      await act(async () => {
        await firstDrop;
      });

      expect(result.current.dragDropState.draggedItemId).toBe(c.id);
      expect(result.current.dragDropState.targetItemId).toBe(a.id);
      expect(result.current.dragDropState.dropMode).toBe('before');
    });
  });

  describe('文件管理器非手动排序模式', () => {
    it('非手动模式同级前后放置被拒、不调用 reorder', async () => {
      const [a, b] = [makeNode('a', null, 'folder'), makeNode('b', null, 'folder')];
      const repository = makeRepository();

      const { result } = renderHook(() => useHarness([a, b], { isFolder, repository, manual: false }));
      act(() => result.current.onDragStart(b.id));
      let validity = { isValid: true };
      act(() => {
        validity = result.current.onDragOver(a, 2, ROW_RECT);
      });
      expect(validity.isValid).toBe(false);
      await act(async () => {
        await result.current.onDrop(a);
      });

      expect(repository.reorder).not.toHaveBeenCalled();
      expect(result.current.dragDropState).toEqual(IDLE_STATE);
    });

    it('非手动模式子级拖到根级节点下方 → { group: { parentId: null } }', async () => {
      const parent = makeNode('p', null, 'folder');
      const child = makeNode('c', 'p', 'file');
      const root = makeNode('r', null, 'folder');
      const repository = makeRepository();

      const { result } = renderHook(() => useHarness([parent, child, root], { isFolder, repository, manual: false }));
      await dragAndDrop(result, child, root, 28);

      expect(repository.reorder).toHaveBeenCalledWith(child.id, { group: { parentId: null } });
    });

    it('非手动模式非根级目标行整行是拖进，拖进文件夹追加到其末尾', async () => {
      const parent = makeNode('p', null, 'folder');
      const sub = makeNode('s', 'p', 'folder');
      const file = makeNode('f', null, 'file');
      const repository = makeRepository();

      const { result } = renderHook(() => useHarness([parent, sub, file], { isFolder, repository, manual: false }));
      // 光标在 sub 行的上沿：非手动模式非根级行仍判为 into
      await dragAndDrop(result, file, sub, 2);

      expect(repository.reorder).toHaveBeenCalledWith(file.id, { group: { parentId: sub.id } });
    });
  });
});
