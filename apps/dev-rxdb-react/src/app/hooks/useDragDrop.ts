import { ITreeEntity, type RxDBEntityId } from '@aiao/rxdb';
import { useCallback, useMemo, useState } from 'react';
import { mergeById } from '../utils/tree-scope';
import { DragDropState, DropMode } from './drag-drop-types';
import { useDragDropService } from './useDragDropService';

const DROP_ZONE_THRESHOLD = 0.33; // 33% from top/bottom for before/after zones

export interface DragDropOptions<T> {
  isFolder?: (item: T) => boolean;

  /**
   * 按需取某个父节点下的同级列表。
   *
   * 懒加载页面必须提供它：落点的同级决定 `sortOrder`，而未展开的分支根本不在
   * `visibleItems` 里 —— 缺了它算出的键会和既有子节点撞车。
   * 一次性全量加载的页面不需要提供（`visibleItems` 本身就是全集）。
   */
  resolveSiblings?: (parentId: RxDBEntityId | null) => Promise<T[]>;
}

/**
 * 树形拖放交互。
 *
 * `visibleItems` 只需要**当前可见（已展开）的节点**，不需要整棵树：
 * 判环要的是目标的祖先链，而能被拖到的节点必然逐级展开过它的祖先，所以祖先链
 * 一定已经在可见集合里。真正可能缺席的只有落点的同级列表，交给 `resolveSiblings`
 * 在 `onDrop`（本就是异步的）里按需取。
 *
 * @param visibleItems - 当前可见节点
 * @param options - 见 {@link DragDropOptions}
 */
export function useDragDrop<T extends ITreeEntity>(visibleItems: T[], options: DragDropOptions<T> = {}) {
  const dragDropService = useDragDropService();
  // P2-7：**必须解构**。`options` 无论是调用点的对象字面量，还是这里的默认值 `{}`，
  // 每次 render 都是新身份；直接把它放进 deps 会让 validateDrop → onDragOver → onDrop
  // 整条链每次 render 全部换新，页面传给被 memo 的行组件后 memo 全线击穿。
  // 依赖收敛到真正被读的那个函数上（调用点需自行 useCallback 稳定它）。
  const { isFolder, resolveSiblings } = options;

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

  // Calculate drop mode based on mouse position
  const calculateDropMode = useCallback((mouseY: number, rect: DOMRect): DropMode => {
    const relativeY = mouseY - rect.top;
    const height = rect.height;

    if (relativeY < height * DROP_ZONE_THRESHOLD) {
      return 'before';
    } else if (relativeY > height * (1 - DROP_ZONE_THRESHOLD)) {
      return 'after';
    } else {
      return 'into';
    }
  }, []);

  // Validate if drop is allowed
  const validateDrop = useCallback(
    (draggedItem: T | undefined, targetItem: T, dropMode: DropMode): boolean => {
      if (!draggedItem) return false;

      // Cannot drop on itself
      if (draggedItem.id === targetItem.id) {
        return false;
      }

      // For 'into' mode, check circular nesting and if target is a folder
      if (dropMode === 'into') {
        if (isFolder && !isFolder(targetItem)) {
          return false;
        }
        return dragDropService.canDropInto(draggedItem, targetItem, visibleItems);
      }

      return true;
    },
    [visibleItems, dragDropService, isFolder]
  );

  const highlightedMenuIds = useMemo(() => {
    if (!dragDropState.draggedItemId) return new Set<RxDBEntityId>();
    return getDescendants(dragDropState.draggedItemId);
  }, [dragDropState.draggedItemId, getDescendants]);

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

      const dropMode = calculateDropMode(mouseY, rect);
      const isValid = validateDrop(draggedItem, targetItem, dropMode);

      setDragDropState(prev => ({
        ...prev,
        targetItemId: targetItem.id,
        dropMode,
        isValidTarget: isValid
      }));

      return { isValid };
    },
    [visibleItems, dragDropState.draggedItemId, calculateDropMode, validateDrop]
  );

  const onDragLeave = useCallback(() => {
    setDragDropState(prev => ({
      ...prev,
      targetItemId: null,
      dropMode: null,
      isValidTarget: false
    }));
  }, []);

  const onDrop = useCallback(
    async (targetItem: T, onExpandFolder?: (folderId: string) => void) => {
      const draggedItem = visibleItems.find(m => m.id === dragDropState.draggedItemId);
      if (!draggedItem || !dragDropState.dropMode || !dragDropState.isValidTarget) {
        setDragDropState({
          draggedItemId: null,
          targetItemId: null,
          dropMode: null,
          isValidTarget: false
        });
        return;
      }

      // 检查是否是冗余拖放（拖到原位置）
      if (draggedItem.id === targetItem.id) {
        setDragDropState({
          draggedItemId: null,
          targetItemId: null,
          dropMode: null,
          isValidTarget: false
        });
        return;
      }

      // 检查是否拖到原位置
      if (dragDropState.dropMode === 'into' && draggedItem.parentId === targetItem.id) {
        setDragDropState({
          draggedItemId: null,
          targetItemId: null,
          dropMode: null,
          isValidTarget: false
        });
        return;
      }

      try {
        // 落点的同级决定新 sortOrder。懒加载树里这批同级可能一条都没加载，
        // 必须按需补齐；否则会把键算在"看得见的最后一个"之后，与实际末位撞车。
        const dropParentId = dragDropState.dropMode === 'into' ? targetItem.id : (targetItem.parentId ?? null);
        const dropScope = resolveSiblings ? mergeById(visibleItems, await resolveSiblings(dropParentId)) : visibleItems;

        const result = await dragDropService.executeDrop(draggedItem, targetItem, dragDropState.dropMode, dropScope);

        if (!result.success) {
          console.error('Drop failed:', result.error?.message);
          throw new Error(result.error?.message || '拖放失败');
        }

        // 如果拖入文件夹,展开该文件夹
        // onExpandFolder 绑定各页面 Set<string> 展开状态，folderId 语义上仍是 UUID。
        if (dragDropState.dropMode === 'into' && result.newParentId && onExpandFolder) {
          onExpandFolder(result.newParentId as string);
        }
      } catch (error: unknown) {
        console.error('Drop error:', error);
        throw error;
      } finally {
        setDragDropState({
          draggedItemId: null,
          targetItemId: null,
          dropMode: null,
          isValidTarget: false
        });
      }
    },
    [visibleItems, dragDropState, dragDropService, resolveSiblings]
  );

  const onDragEnd = useCallback(() => {
    setDragDropState({
      draggedItemId: null,
      targetItemId: null,
      dropMode: null,
      isValidTarget: false
    });
  }, []);

  return {
    dragDropState,
    highlightedMenuIds,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd
  };
}
