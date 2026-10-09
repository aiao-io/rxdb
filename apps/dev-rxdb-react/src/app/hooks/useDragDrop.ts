import { type ReorderTarget, type RxDBEntityId } from '@aiao/rxdb';
import { ITreeEntity } from '@aiao/rxdb-plugin-tree';
import { useCallback, useMemo, useState } from 'react';
import { DragDropState, DropMode } from './drag-drop-types';
import { isTargetInMovedSubtree, resolveTreeDrop, treeDropPosition } from './useDragDropService';
import type { UseTreeWriteError } from './useTreeWriteError';

/** 拖放用到的仓库能力：只有 `reorder`（`rxdb.entityManager.getRepository(Entity)` 的结果满足它）。 */
export interface TreeReorderRepository {
  reorder(id: RxDBEntityId, target: ReorderTarget<RxDBEntityId>): Promise<unknown>;
}

export interface DragDropOptions<T> {
  /** 被拖节点交给引擎重排的仓库。 */
  repository: TreeReorderRepository;

  /**
   * 页内写入失败的出口（`useTreeWriteError().runWrite`，页面的 store 已经带着它）。
   *
   * 拖放失败以「拖放失败：<错误消息>」进同一个 `OperationErrorAlert`；`useDragDrop` 是拖放错误的唯一出口，
   * 页面的 `onDrop` 不再需要 try / catch，更不能 `alert`。
   */
  runWrite: UseTreeWriteError['runWrite'];

  /** 目标是否文件夹（文件不作拖入目标）；菜单节点恒为文件夹，不传即可。 */
  isFolder?: (item: T) => boolean;

  /**
   * 是否手动排序：菜单恒为 `true`；文件管理器传 `sortMode === SortMode.Manual`。
   * 非手动模式下前后放置没有意义，只保留换父节点（见 `resolveTreeDrop`）。默认 `true`。
   */
  manual?: boolean;

  /**
   * 某个父节点下**完整**的手动序列（`null` 取根组），前后放置的邻居从这里换算。
   *
   * 不能取页面渲染出来的可见行：搜索会过滤掉兄弟、虚拟滚动只渲染窗口内的行，
   * 漏掉的兄弟会被夹在两个邻居之间，引擎按「邻居不相邻」拒绝。
   * 一次性加载全集的页面不需要提供（`visibleItems` 本身就是全集，查询已按手动顺序排好）；
   * 懒加载页面提供 store 里该组已整组加载的 id 序列。拖进节点不用它。
   */
  getGroupIds?: (parentId: RxDBEntityId | null) => readonly RxDBEntityId[];
}

/**
 * 树形拖放交互。
 *
 * 落点判定只有一处：`resolveTreeDrop`。拖动中的高亮（`onDragOver`）与放下时的执行（`onDrop`）都调它，
 * 判定为 `reject` 的落点高亮为无效，放下时零写；`reorder` 才交给引擎，一次拖放就是一次提交。
 *
 * `visibleItems` 只需要**当前可见（已展开）的节点**，不需要整棵树：
 * 判环要的是目标的祖先链，而能被拖到的节点必然逐级展开过它的祖先，所以祖先链一定已经在可见集合里。
 *
 * @param visibleItems - 当前可见节点（一次性加载的页面可以直接传全集）
 * @param options - 见 {@link DragDropOptions}
 */
export function useDragDrop<T extends ITreeEntity>(visibleItems: T[], options: DragDropOptions<T>) {
  // P2-7：**必须解构**。`options` 是调用点的对象字面量，每次 render 都是新身份；直接把它放进 deps
  // 会让 decide → onDragOver → onDrop 整条链每次 render 全部换新，页面传给被 memo 的行组件后 memo 全线击穿。
  // 依赖收敛到真正被读的那几项上（调用点需自行保证它们身份稳定）。
  const { repository, runWrite, isFolder, manual = true, getGroupIds } = options;

  const [dragDropState, setDragDropState] = useState<DragDropState>({
    draggedItemId: null,
    targetItemId: null,
    dropMode: null,
    isValidTarget: false
  });

  // Get all descendants of a node
  const getDescendants = useCallback(
    (itemId: RxDBEntityId): Set<RxDBEntityId> => {
      const descendants = new Set<RxDBEntityId>();
      const queue: RxDBEntityId[] = [itemId];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const children = visibleItems.filter(m => m.parentId === currentId);
        children.forEach(child => {
          descendants.add(child.id);
          queue.push(child.id);
        });
      }

      return descendants;
    },
    [visibleItems]
  );

  // 目标所在组的完整手动序列：懒加载页由 store 提供，一次性加载的页面取自全集（查询顺序即手动顺序）
  const groupIdsOf = useCallback(
    (parentId: RxDBEntityId | null): readonly RxDBEntityId[] =>
      getGroupIds ?
        getGroupIds(parentId)
      : visibleItems.filter(item => (item.parentId ?? null) === parentId).map(item => item.id),
    [getGroupIds, visibleItems]
  );

  // 拖动中的高亮与放下时的执行共用的判定
  const decide = useCallback(
    (draggedItem: T, targetItem: T, position: DropMode) => {
      const targetParentId = targetItem.parentId ?? null;
      return resolveTreeDrop<RxDBEntityId>({
        movedId: draggedItem.id,
        target: { id: targetItem.id, parentId: targetParentId, isFolder: isFolder ? isFolder(targetItem) : true },
        position,
        manual,
        movedParentId: draggedItem.parentId ?? null,
        isTargetInMovedSubtree: isTargetInMovedSubtree(draggedItem.id, targetItem, visibleItems),
        groupIds: manual && position !== 'into' ? groupIdsOf(targetParentId) : []
      });
    },
    [visibleItems, isFolder, manual, groupIdsOf]
  );

  // 光标落在目标行的哪一档：dragover 的高亮与 drop 的重算共用这一处
  const dropModeAt = useCallback(
    (targetItem: T, mouseY: number, rect: DOMRect): DropMode =>
      treeDropPosition(mouseY - rect.top, rect.height, {
        manual,
        targetIsRoot: (targetItem.parentId ?? null) === null
      }),
    [manual]
  );

  const highlightedMenuIds = useMemo(() => {
    if (!dragDropState.draggedItemId) return new Set<RxDBEntityId>();
    return getDescendants(dragDropState.draggedItemId);
  }, [dragDropState.draggedItemId, getDescendants]);

  const resetState = useCallback(() => {
    setDragDropState({
      draggedItemId: null,
      targetItemId: null,
      dropMode: null,
      isValidTarget: false
    });
  }, []);

  const onDragStart = useCallback((itemId: RxDBEntityId) => {
    setDragDropState({
      draggedItemId: itemId,
      targetItemId: null,
      dropMode: null,
      isValidTarget: false,
      dragStartTime: Date.now()
    });
  }, []);

  const onDragOver = useCallback(
    (targetItem: T, mouseY: number, rect: DOMRect) => {
      const draggedItem = visibleItems.find(m => m.id === dragDropState.draggedItemId);
      if (!draggedItem) return { isValid: false };

      const dropMode = dropModeAt(targetItem, mouseY, rect);
      const isValid = decide(draggedItem, targetItem, dropMode).kind !== 'reject';

      setDragDropState(prev => ({
        ...prev,
        targetItemId: targetItem.id,
        dropMode,
        isValidTarget: isValid
      }));

      return { isValid };
    },
    [visibleItems, dragDropState.draggedItemId, dropModeAt, decide]
  );

  const onDragLeave = useCallback(() => {
    setDragDropState(prev => ({
      ...prev,
      targetItemId: null,
      dropMode: null,
      isValidTarget: false
    }));
  }, []);

  /**
   * 放下：判定 → `reorder`。`reject` / `noop` 零写、不出提示；`reorder` 失败进页内提示，不向外抛。
   * 拖拽状态在成功、失败、`reject`、`noop` 四条路径上都复位。
   *
   * @param targetItem - 放下的目标行
   * @param onExpandFolder - 拖进成功后展开目标（`onExpandFolder` 绑定各页面 Set<string> 展开状态，folderId 语义上仍是 UUID）
   * @param point - 放下事件的光标纵坐标与目标行矩形；传入时按它与 `onDragOver` 同一判定函数重算落点，
   *   不沿用 state 里最后一次 dragover 留下的 `dropMode`（浏览器对 dragover 节流，二者可能差一档）
   */
  const onDrop = useCallback(
    async (targetItem: T, onExpandFolder?: (folderId: string) => void, point?: { mouseY: number; rect: DOMRect }) => {
      try {
        const draggedItem = visibleItems.find(m => m.id === dragDropState.draggedItemId);
        const dropMode = point ? dropModeAt(targetItem, point.mouseY, point.rect) : dragDropState.dropMode;
        if (!draggedItem || !dropMode) return;

        // 判定可能抛错（如 `getGroupIds` 的组未加载），与写入同走 runWrite 进页内提示，不逃成未处理拒绝
        const result = await runWrite('拖放', async () => {
          const decision = decide(draggedItem, targetItem, dropMode);
          if (decision.kind !== 'reorder') return false;
          await repository.reorder(draggedItem.id, decision.target);
          return true;
        });
        if (result.ok && result.value && dropMode === 'into' && onExpandFolder) {
          onExpandFolder(targetItem.id as string);
        }
      } finally {
        resetState();
      }
    },
    [visibleItems, dragDropState, dropModeAt, decide, runWrite, repository, resetState]
  );

  return {
    dragDropState,
    highlightedMenuIds,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd: resetState
  };
}
