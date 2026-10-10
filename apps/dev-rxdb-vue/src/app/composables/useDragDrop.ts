import { type ReorderTarget, type RxDBEntityId } from '@aiao/rxdb';
import { ISortableTreeEntity } from '@aiao/rxdb-plugin-tree';
import { computed, ref, unref, type MaybeRef } from 'vue';
import { SortMode } from '../utils/file-sorters';
import type { TreeWriteOperation } from '../utils/tree-write-error';
import { DragDropState, DropMode } from './drag-drop-types';
import { resolveTreeDrop, treeDropPosition, type TreeDropDecision } from './useDragDropService';

/** 拖放写入所需的仓库面：只用 `reorder()`，传 `rxdb.entityManager.getRepository(Entity)` 即可。 */
export interface DragDropRepository {
  reorder(id: RxDBEntityId, target: ReorderTarget<RxDBEntityId>): Promise<unknown>;
}

/** 与 `useTreeWriteError().guardWrite` 同形：失败写入页内提示并返回 `false`，不向外抛。 */
export type GuardWrite = (operation: TreeWriteOperation, write: () => Promise<unknown>) => Promise<boolean>;

export interface DragDropOptions<T> {
  /** 重排写入的仓库 */
  repository: DragDropRepository;
  /** 页面的写入守卫，拖放失败进同一个 `TreeWriteError` 提示 */
  guardWrite: GuardWrite;
  /** 节点能否作拖入目标；菜单节点恒可，文件管理器取节点类型 */
  isFolder?: (item: T) => boolean;
  /** 文件管理器当前排序模式；菜单不传，恒按手动排序 */
  sortMode?: MaybeRef<SortMode>;
  /**
   * 某个父节点下完整的手动序列（`null` 为根组），用于换算前后放置的邻居。
   * 不传则取 `allItems` 里同父节点的节点，按 `allItems` 的顺序（全量页的查询顺序）；
   * 懒加载页的 `allItems` 只是已加载快照，需传入各组完整已加载的子节点 id。
   */
  groupIds?: (parentId: RxDBEntityId | null) => readonly RxDBEntityId[];
}

/**
 * 树页面的拖放状态与放下时的写入。
 *
 * @remarks
 * 高亮（`onDragOver`）与执行（`onDrop`）调用同一个 `resolveTreeDrop`；放下只经 `Repository.reorder()`，
 * 成功、失败、被拒、原位四条路径都复位拖拽状态。
 *
 * @param allItems - 页面持有的节点；用于查被拖节点、祖先链与后代，不是前后放置的位置来源
 * @param options - 见 {@link DragDropOptions}
 */
export function useDragDrop<T extends ISortableTreeEntity>(allItems: MaybeRef<T[]>, options: DragDropOptions<T>) {
  const dragDropState = ref<DragDropState>({
    draggedItemId: null,
    targetItemId: null,
    dropMode: null,
    isValidTarget: false
  });

  const itemsById = computed(() => new Map(unref(allItems).map(item => [item.id, item])));
  const childrenByParent = computed(() => {
    const map = new Map<RxDBEntityId | null, T[]>();
    for (const item of unref(allItems)) {
      const parentId = item.parentId ?? null;
      const siblings = map.get(parentId) ?? [];
      siblings.push(item);
      map.set(parentId, siblings);
    }
    return map;
  });

  const findItem = (id: RxDBEntityId | null): T | undefined => (id === null ? undefined : itemsById.value.get(id));

  const isManual = () => (unref(options.sortMode) ?? SortMode.Manual) === SortMode.Manual;

  const groupIdsOf = (parentId: RxDBEntityId | null): readonly RxDBEntityId[] =>
    options.groupIds ? options.groupIds(parentId) : (childrenByParent.value.get(parentId) ?? []).map(item => item.id);

  // 目标是被拖节点自己或其后代：沿目标的祖先链找被拖节点
  const isInSubtreeOf = (movedId: RxDBEntityId, target: T): boolean => {
    const seen = new Set<RxDBEntityId>();
    let current: T | undefined = target;
    while (current && !seen.has(current.id)) {
      if (current.id === movedId) return true;
      seen.add(current.id);
      current = current.parentId == null ? undefined : itemsById.value.get(current.parentId);
    }
    return false;
  };

  const resolve = (dragged: T, target: T, position: DropMode): TreeDropDecision<RxDBEntityId> => {
    const targetParentId = target.parentId ?? null;
    const manual = isManual();
    return resolveTreeDrop<RxDBEntityId>({
      movedId: dragged.id,
      target: { id: target.id, parentId: targetParentId, isFolder: options.isFolder ? options.isFolder(target) : true },
      position,
      manual,
      movedParentId: dragged.parentId ?? null,
      isTargetInMovedSubtree: isInSubtreeOf(dragged.id, target),
      // 只有手动模式的前后放置读组序列；拖进与非手动模式不读，懒加载页因此不必加载目标的子节点
      groupIds: manual && position !== 'into' ? groupIdsOf(targetParentId) : []
    });
  };

  const highlightedMenuIds = computed(() => {
    const descendants = new Set<RxDBEntityId>();
    const draggedId = dragDropState.value.draggedItemId;
    if (!draggedId) return descendants;

    const queue: RxDBEntityId[] = [draggedId];
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      for (const child of childrenByParent.value.get(id) ?? []) {
        descendants.add(child.id);
        queue.push(child.id);
      }
    }
    return descendants;
  });

  const onDragStart = (itemId: RxDBEntityId) => {
    dragDropState.value = {
      draggedItemId: itemId,
      targetItemId: null,
      dropMode: null,
      isValidTarget: false,
      dragStartTime: Date.now()
    };
  };

  const onDragOver = (targetItem: T, mouseY: number, rect: DOMRect) => {
    const draggedItem = findItem(dragDropState.value.draggedItemId);
    if (!draggedItem) return { isValid: false };

    const dropMode = treeDropPosition(mouseY - rect.top, rect.height, {
      manual: isManual(),
      targetIsRoot: (targetItem.parentId ?? null) === null
    });
    const isValid = resolve(draggedItem, targetItem, dropMode).kind !== 'reject';

    dragDropState.value = {
      ...dragDropState.value,
      targetItemId: targetItem.id,
      dropMode,
      isValidTarget: isValid
    };

    return { isValid, dropMode };
  };

  const onDragLeave = () => {
    dragDropState.value = {
      ...dragDropState.value,
      targetItemId: null,
      dropMode: null,
      isValidTarget: false
    };
  };

  const resetState = () => {
    dragDropState.value = {
      draggedItemId: null,
      targetItemId: null,
      dropMode: null,
      isValidTarget: false
    };
  };

  /**
   * 放下：判定为 `reorder` 才写；`reject` / `noop` 不调用引擎，也不出提示。
   *
   * 复位必须在 `await` 之前：放下一发生拖放就已结束，高亮应立即清除。放进 `finally` 会等到
   * 引擎写入完成——上一次拖放的写入慢到下一次拖放已经开始时才回来，会把新拖放刚建立的状态抹掉，
   * 下一次放下因此被静默吞掉（与 React 端 useDragDrop 同一竞态，三端对称）。
   *
   * @param targetItem - 放置目标行
   * @param onComplete - 拖进某个节点写入成功后回调该节点 id，页面据此展开目标
   */
  const onDrop = async (targetItem: T, onComplete?: (targetId: RxDBEntityId) => void): Promise<void> => {
    // 先取现场再复位：`draggedItem` / `dropMode` 来自本 state，复位后就拿不到了
    const { draggedItemId, dropMode } = dragDropState.value;
    const draggedItem = findItem(draggedItemId);
    resetState();
    if (!draggedItem || !dropMode) return;

    const decision = resolve(draggedItem, targetItem, dropMode);
    if (decision.kind !== 'reorder') return;

    const written = await options.guardWrite('拖放', () => options.repository.reorder(draggedItem.id, decision.target));
    if (written && dropMode === 'into') onComplete?.(targetItem.id);
  };

  return {
    dragDropState,
    highlightedMenuIds,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDragEnd: resetState,
    onDrop,
    resetState
  };
}
