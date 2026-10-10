import { SortOrderError, type ReorderTarget, type RxDBEntityId } from '@aiao/rxdb';
import type { ISortableTreeEntity } from '@aiao/rxdb-plugin-tree';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shallowRef } from 'vue';
import { SortMode } from '../utils/file-sorters';
import { useDragDrop, type DragDropOptions } from './useDragDrop.js';
import { useToast } from './useToast';
import { useTreeWriteError } from './useTreeWriteError';

interface TestNode extends ISortableTreeEntity {
  folder: boolean;
}

const node = (id: string, parentId: string | null = null, folder = true): TestNode => ({
  id,
  parentId,
  folder,
  sortOrder: id,
  createdAt: new Date(0),
  updatedAt: new Date(0)
});

/** 行高 100：偏移 15 落 before、50 落 into、85 落 after */
const ROW = new DOMRect(0, 0, 100, 100);
const BEFORE = 15;
const INTO = 50;
const AFTER = 85;

const setup = (
  items: TestNode[],
  options: Partial<Pick<DragDropOptions<TestNode>, 'groupIds' | 'sortMode'>> = {},
  reorder: (id: RxDBEntityId, target: ReorderTarget<RxDBEntityId>) => Promise<unknown> = async () => undefined
) => {
  const reorderSpy = vi.fn(reorder);
  const { writeError, clearWriteError, guardWrite } = useTreeWriteError();
  const dragDrop = useDragDrop<TestNode>(shallowRef(items), {
    repository: { reorder: reorderSpy },
    guardWrite,
    isFolder: item => item.folder,
    ...options
  });
  const dropOn = async (
    dragged: TestNode,
    target: TestNode,
    offsetY: number,
    onComplete?: (id: RxDBEntityId) => void
  ) => {
    dragDrop.onDragStart(dragged.id);
    dragDrop.onDragOver(target, offsetY, ROW);
    await dragDrop.onDrop(target, onComplete);
  };
  return { dragDrop, reorderSpy, writeError, clearWriteError, dropOn };
};

const IDLE_STATE = { draggedItemId: null, targetItemId: null, dropMode: null, isValidTarget: false };

describe('useDragDrop', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('拖进折叠且子节点未加载的节点：目标为 { group }，不读子节点', async () => {
    const dragged = node('a');
    const collapsed = node('b');
    const groupIds = vi.fn((): readonly RxDBEntityId[] => []);
    const { reorderSpy, dropOn } = setup([dragged, collapsed], { groupIds });

    await dropOn(dragged, collapsed, INTO);

    expect(reorderSpy).toHaveBeenCalledExactlyOnceWith('a', { group: { parentId: 'b' } });
    expect(groupIds).not.toHaveBeenCalled();
  });

  it('前后放置的邻居取自组的完整序列，不取搜索过滤后的可见行', async () => {
    // 搜索把 b、c 过滤掉了，可见行只剩 a、d；邻居必须是 a 与 b，否则引擎按 staleTarget 拒绝
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(id => node(id));
    const { reorderSpy, dropOn } = setup([a, b, c, d]);

    await dropOn(d, a, AFTER);

    expect(reorderSpy).toHaveBeenCalledExactlyOnceWith('d', { prevId: 'a', nextId: 'b' });
  });

  it('前后放置的组序列可由页面按父节点提供（懒加载页取整组已加载子节点）', async () => {
    const dragged = node('x');
    const child1 = node('c1', 'p');
    const child2 = node('c2', 'p');
    const groupIds = vi.fn((parentId: RxDBEntityId | null): readonly RxDBEntityId[] =>
      parentId === 'p' ? ['c1', 'c2'] : []
    );
    const { reorderSpy, dropOn } = setup([dragged, node('p'), child1, child2], { groupIds });

    await dropOn(dragged, child1, AFTER);

    expect(groupIds).toHaveBeenCalledWith('p');
    expect(reorderSpy).toHaveBeenCalledExactlyOnceWith('x', { prevId: 'c1', nextId: 'c2' });
  });

  it('reorder 抛 SortOrderError 时页内提示「拖放失败：…」、拖拽状态复位、不弹窗', async () => {
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    const [a, b] = [node('a'), node('b')];
    const { dragDrop, writeError, dropOn } = setup([a, b], {}, async () => {
      throw new SortOrderError('SortableMenuSimple', 'staleTarget', '邻居已不相邻');
    });

    await dropOn(a, b, AFTER);

    expect(writeError.value).toBe('拖放失败：SortableMenuSimple: 邻居已不相邻');
    expect(dragDrop.dragDropState.value).toEqual(IDLE_STATE);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(useToast().toasts.value).toEqual([]);
  });

  it('下一次拖放清空错误', async () => {
    const [a, b, c] = [node('a'), node('b'), node('c')];
    let fail = true;
    const { writeError, dropOn } = setup([a, b, c], {}, async () => {
      if (fail) throw new SortOrderError('SortableMenuSimple', 'staleTarget', '邻居已不相邻');
    });
    await dropOn(a, c, AFTER);
    expect(writeError.value).not.toBeNull();

    fail = false;
    await dropOn(a, c, AFTER);

    expect(writeError.value).toBeNull();
  });

  it('save/reorder 抛错时拖拽状态复位', async () => {
    const [a, b] = [node('a'), node('b')];
    const { dragDrop, dropOn } = setup([a, b], {}, async () => {
      throw new Error('boom');
    });

    await dropOn(a, b, AFTER);

    expect(dragDrop.dragDropState.value).toEqual(IDLE_STATE);
  });

  it('reject / noop 不调用 reorder', async () => {
    const [a, b] = [node('a'), node('b')];
    const file = node('f', null, false);
    const { dragDrop, reorderSpy, writeError, dropOn } = setup([a, b, file]);

    // noop：a 已在 b 之前，放在 b 前面是原位
    await dropOn(a, b, BEFORE);
    // reject：文件不作拖入目标
    await dropOn(a, file, INTO);
    // reject：拖到自己
    await dropOn(a, a, INTO);

    expect(reorderSpy).not.toHaveBeenCalled();
    expect(writeError.value).toBeNull();
    expect(dragDrop.dragDropState.value).toEqual(IDLE_STATE);
  });

  it('前后放置到后代上被拒、不调用 reorder', async () => {
    const parent = node('p');
    const child = node('c', 'p');
    const grandchild = node('g', 'c');
    const { dragDrop, reorderSpy, dropOn } = setup([parent, child, grandchild]);

    dragDrop.onDragStart(parent.id);
    const over = dragDrop.onDragOver(grandchild, AFTER, ROW);
    expect(over.isValid).toBe(false);
    expect(dragDrop.dragDropState.value).toMatchObject({ targetItemId: 'g', dropMode: 'after', isValidTarget: false });
    dragDrop.resetState();

    await dropOn(parent, grandchild, BEFORE);
    await dropOn(parent, grandchild, AFTER);

    expect(reorderSpy).not.toHaveBeenCalled();
  });

  it('非手动模式同级前后放置被拒、不调用 reorder', async () => {
    // 同级：a、b 同在根组；根级行仍分三档，所以 before / after 能落到，但判定为拒绝
    const [a, b] = [node('a'), node('b')];
    const { dragDrop, reorderSpy, dropOn } = setup([a, b], { sortMode: SortMode.NameAsc });

    dragDrop.onDragStart(a.id);
    expect(dragDrop.onDragOver(b, AFTER, ROW)).toEqual({ isValid: false, dropMode: 'after' });
    dragDrop.resetState();

    await dropOn(a, b, AFTER);
    await dropOn(a, b, BEFORE);

    expect(reorderSpy).not.toHaveBeenCalled();
  });

  it('非手动模式子级拖到根级节点下方 → { group: { parentId: null } }', async () => {
    const folder = node('f');
    const child = node('c', 'f', false);
    const root = node('r');
    const { reorderSpy, dropOn } = setup([folder, child, root], { sortMode: SortMode.NameAsc });

    await dropOn(child, root, AFTER);

    expect(reorderSpy).toHaveBeenCalledExactlyOnceWith('c', { group: { parentId: null } });
  });

  it('非手动模式非根级行整行为拖入：拖进当前父文件夹被拒，拖进其他文件夹追加到末尾', async () => {
    const folder = node('f');
    const other = node('g');
    const inner = node('i', 'f');
    const child = node('c', 'f', false);
    const { dragDrop, reorderSpy, dropOn } = setup([folder, other, inner, child], { sortMode: SortMode.SizeDesc });

    // inner 是非根级行：上缘也算 into；c 的当前父文件夹是 f，拖到 inner（也在 f 下）仍是拖进 inner
    dragDrop.onDragStart(child.id);
    expect(dragDrop.onDragOver(inner, BEFORE, ROW)).toEqual({ isValid: true, dropMode: 'into' });
    dragDrop.resetState();

    await dropOn(child, inner, BEFORE);
    expect(reorderSpy).toHaveBeenLastCalledWith('c', { group: { parentId: 'i' } });

    await dropOn(child, folder, INTO);
    expect(reorderSpy).toHaveBeenCalledTimes(1);
  });

  it('手动模式拖进节点成功后回调目标节点，前后放置不回调', async () => {
    const [a, b, c] = [node('a'), node('b'), node('c')];
    const { dropOn } = setup([a, b, c]);
    const onComplete = vi.fn();

    await dropOn(a, c, AFTER, onComplete);
    expect(onComplete).not.toHaveBeenCalled();

    await dropOn(a, c, INTO, onComplete);
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('c');
  });

  it('拖动中高亮被拖节点的全部后代', () => {
    const [a, b] = [node('a'), node('b')];
    const [a1, a2] = [node('a1', 'a'), node('a2', 'a1')];
    const { dragDrop } = setup([a, b, a1, a2]);

    dragDrop.onDragStart(a.id);

    expect([...dragDrop.highlightedMenuIds.value].sort()).toEqual(['a1', 'a2']);
  });

  it('上一次拖放的写入未完成时开始下一次拖放：迟到的复位不能抹掉新拖放的状态', async () => {
    const [a, b, c] = ['a', 'b', 'c'].map(id => node(id));
    let resolveReorder!: () => void;
    // 第一次拖放的引擎写入挂起（CI 上 OPFS 事务可能慢到百毫秒级，期间用户已开始下一次拖放）
    const { dragDrop, reorderSpy } = setup(
      [a, b, c],
      {},
      () => new Promise<void>(resolve => (resolveReorder = resolve))
    );

    // 第一次拖放：b 拖进 a，放下后写入挂起
    dragDrop.onDragStart(b.id);
    dragDrop.onDragOver(a, INTO, ROW);
    const firstDrop = dragDrop.onDrop(a);

    // 第二次拖放开始：c 拖到 a 的上沿，状态已建立
    dragDrop.onDragStart(c.id);
    dragDrop.onDragOver(a, BEFORE, ROW);
    expect(dragDrop.dragDropState.value.draggedItemId).toBe(c.id);
    expect(dragDrop.dragDropState.value.targetItemId).toBe(a.id);

    // 第一次的写入这时才完成：它的复位只该清它自己的拖放，不能抹掉第二次的
    resolveReorder();
    await firstDrop;

    expect(dragDrop.dragDropState.value.draggedItemId).toBe(c.id);
    expect(dragDrop.dragDropState.value.targetItemId).toBe(a.id);
    expect(dragDrop.dragDropState.value.dropMode).toBe('before');
    expect(reorderSpy).toHaveBeenCalledExactlyOnceWith('b', { group: { parentId: 'a' } });
  });
});
