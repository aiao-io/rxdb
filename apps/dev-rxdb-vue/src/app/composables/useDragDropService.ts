import { ISortableTreeEntity, type RxDBEntityId } from '@aiao/rxdb';
import { generateKeyBetween } from '@aiao/utils';
import { DragDropError, DragDropErrorCode, DropMode, DropResult } from './drag-drop-types';

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
    } catch {
      return {
        success: false,
        error: new DragDropError(DragDropErrorCode.INVALID_OPERATION, 'Failed to calculate drop position')
      };
    }
  }

  /**
   * Check if itemA is a descendant of itemB
   */
  private isDescendantOf<T extends ISortableTreeEntity>(itemA: T, itemB: T, allItems: T[]): boolean {
    let current = itemA;
    while (current.parentId) {
      if (current.parentId === itemB.id) {
        return true;
      }
      const parent = allItems.find(m => m.id === current.parentId);
      if (!parent) break;
      current = parent;
    }
    return false;
  }
}

const DRAG_DROP_SERVICE = new DragDropService();

/**
 * 返回拖放服务单例。
 *
 * DragDropService 是无状态的纯计算服务，跨组件复用同一实例避免重复创建。
 */
export function useDragDropService(): DragDropService {
  return DRAG_DROP_SERVICE;
}
