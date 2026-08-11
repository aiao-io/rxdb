import { ISortableTreeEntity, type RxDBEntityId, UUID } from '@aiao/rxdb';
import { generateKeyBetween } from '@aiao/utils';
import { DragDropError, DragDropErrorCode, DropMode, DropResult } from './drag-drop-types';

interface Saveable {
  save: () => Promise<unknown>;
}

const compareSortOrder = (a: ISortableTreeEntity, b: ISortableTreeEntity): number => {
  const orderA = a.sortOrder || '';
  const orderB = b.sortOrder || '';
  if (orderA < orderB) return -1;
  if (orderA > orderB) return 1;
  return 0;
};

/**
 * Service for handling menu drag and drop operations
 */
export class DragDropService {
  /**
   * Check if an item can be dropped into a target folder
   */
  canDropInto<T extends ISortableTreeEntity>(draggedItem: T, targetItem: T, allItems: T[]): boolean {
    if (draggedItem.id === targetItem.id) {
      return false;
    }

    if (this.isDescendantOf(targetItem, draggedItem, allItems)) {
      return false;
    }

    return true;
  }

  /**
   * Calculate the new drop position and generate sort order key
   */
  calculateDropPosition<T extends ISortableTreeEntity>(
    draggedItem: T,
    targetItem: T,
    dropMode: DropMode,
    allItems: T[]
  ): DropResult {
    try {
      let newSortOrder: string;
      let newParentId: RxDBEntityId | null;

      if (dropMode === 'into') {
        newParentId = targetItem.id;
        const targetChildren = allItems.filter(m => m.parentId === targetItem.id).sort(compareSortOrder);

        const lastChild = targetChildren[targetChildren.length - 1];
        try {
          newSortOrder = generateKeyBetween(lastChild?.sortOrder || null, null);
        } catch {
          return {
            success: false,
            error: new DragDropError(DragDropErrorCode.INVALID_OPERATION, 'REORDER_NEEDED')
          };
        }
      } else {
        newParentId = targetItem.parentId || null;

        const sameLevelSiblings = allItems.filter(m => m.parentId === newParentId).sort(compareSortOrder);
        const targetIndex = sameLevelSiblings.findIndex(m => m.id === targetItem.id);

        try {
          if (dropMode === 'before') {
            const prevItem = sameLevelSiblings[targetIndex - 1];
            newSortOrder = generateKeyBetween(prevItem?.sortOrder || null, targetItem.sortOrder || null);
          } else {
            const nextItem = sameLevelSiblings[targetIndex + 1];
            newSortOrder = generateKeyBetween(targetItem.sortOrder || null, nextItem?.sortOrder || null);
          }
        } catch {
          return {
            success: false,
            error: new DragDropError(DragDropErrorCode.INVALID_OPERATION, 'REORDER_NEEDED')
          };
        }
      }

      return {
        success: true,
        newSortOrder,
        newParentId
      };
    } catch (error) {
      return {
        success: false,
        error: new DragDropError(
          DragDropErrorCode.INVALID_OPERATION,
          `Failed to calculate drop position: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      };
    }
  }

  /**
   * Execute the drop operation
   */
  async executeDrop<T extends ISortableTreeEntity>(
    draggedItem: T,
    targetItem: T,
    dropMode: DropMode,
    allItems: T[]
  ): Promise<DropResult> {
    if (draggedItem.id === targetItem.id) {
      return {
        success: false,
        error: new DragDropError(DragDropErrorCode.SELF_DROP, '不能拖放到自身')
      };
    }

    if (!this.canDropInto(draggedItem, targetItem, allItems)) {
      return {
        success: false,
        error: new DragDropError(DragDropErrorCode.CIRCULAR_NESTING, '不能拖放到子节点中')
      };
    }

    const result = this.calculateDropPosition(draggedItem, targetItem, dropMode, allItems);

    if (!result.success || !result.newSortOrder) {
      return result;
    }

    try {
      draggedItem.sortOrder = result.newSortOrder;
      if (result.newParentId !== undefined) {
        draggedItem.parentId = result.newParentId as UUID | null;
      }

      // save() 由 EntityBase 提供，不在 ISortableTreeEntity 数据契约里，因此局部 narrow。
      await (draggedItem as unknown as Saveable).save();

      return {
        success: true,
        newSortOrder: result.newSortOrder,
        newParentId: result.newParentId
      };
    } catch (error) {
      return {
        success: false,
        error: new DragDropError(
          DragDropErrorCode.INVALID_OPERATION,
          `保存失败: ${error instanceof Error ? error.message : '未知错误'}`
        )
      };
    }
  }

  /**
   * Check if targetItem is a descendant of ancestorItem
   */
  private isDescendantOf<T extends ISortableTreeEntity>(targetItem: T, ancestorItem: T, allItems: T[]): boolean {
    let current: T | undefined = targetItem;
    const itemMap = new Map(allItems.map(item => [item.id, item]));

    while (current && current.parentId) {
      if (current.parentId === ancestorItem.id) {
        return true;
      }
      current = itemMap.get(current.parentId);
    }

    return false;
  }
}

const DRAG_DROP_SERVICE = new DragDropService();

/**
 * 返回拖放服务单例。
 *
 * DragDropService 是无状态的纯计算服务，跨组件复用同一实例可以让 useMemo/useCallback
 * 把它当稳定依赖，避免每次 render 触发回调重建。
 */
export function useDragDropService(): DragDropService {
  return DRAG_DROP_SERVICE;
}
