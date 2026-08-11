import type { RxDBEntityId } from '@aiao/rxdb';
import { generateKeyBetween } from '@aiao/utils';
import { Injectable } from '@angular/core';
import { DragDropError, DragDropErrorCode, DropMode, DropResult } from '../models/drag-drop-types';

interface DraggableMenu {
  id: RxDBEntityId;
  parentId?: RxDBEntityId | null;
  sortOrder?: string | null;
  save: () => Promise<unknown>;
}

/**
 * Service for handling menu drag and drop operations
 */
@Injectable({
  providedIn: 'root'
})
export class MenuDragDropService {
  /**
   * Rebalance sortOrder for siblings at a specific level
   *
   * @param siblings - All siblings that need rebalancing
   * @returns Promise that resolves when rebalancing is complete
   */
  async rebalanceSortOrder<T extends DraggableMenu>(siblings: T[]): Promise<void> {
    const sorted = siblings.sort((a, b) => {
      const orderA = a.sortOrder || '';
      const orderB = b.sortOrder || '';
      if (orderA < orderB) return -1;
      if (orderA > orderB) return 1;
      return 0;
    });

    let lastSortOrder: string | null = null;
    for (const item of sorted) {
      const newSortOrder = generateKeyBetween(lastSortOrder, null);
      item.sortOrder = newSortOrder;
      await item.save();
      lastSortOrder = newSortOrder;
    }
  }

  /**
   * Check if an item can be dropped into a target folder
   *
   * @param draggedItem - The item being dragged
   * @param targetItem - The target item to drop into
   * @param allMenus - All menu items (needed for descendant checking)
   * @returns True if the drop is valid, false otherwise
   */
  canDropInto<T extends DraggableMenu>(draggedItem: T, targetItem: T, allMenus: readonly T[]): boolean {
    // Cannot drop into itself
    if (draggedItem.id === targetItem.id) {
      return false;
    }

    // Check for circular nesting (all items can have children)
    if (this.isDescendantOf(targetItem, draggedItem, allMenus)) {
      return false;
    }

    return true;
  }

  /**
   * Calculate the new drop position and generate sort order key
   *
   * @param draggedItem - The item being dragged
   * @param targetItem - The target item (reference point)
   * @param dropMode - Where to drop relative to target ('before', 'after', 'into')
   * @param siblings - Array of sibling items at the target level
   * @returns Drop result with new sort order and parent ID
   */
  calculateDropPosition(
    draggedItem: DraggableMenu,
    targetItem: DraggableMenu,
    dropMode: DropMode,
    siblings: readonly DraggableMenu[]
  ): DropResult {
    try {
      let newSortOrder: string;
      let newParentId: RxDBEntityId | null;

      if (dropMode === 'into') {
        // Dropping into a folder
        newParentId = targetItem.id;
        // Get children of target folder, sorted by sortOrder
        const targetChildren = siblings
          .filter(m => m.parentId === targetItem.id)
          .sort((a, b) => {
            const orderA = a.sortOrder || '';
            const orderB = b.sortOrder || '';
            if (orderA < orderB) return -1;
            if (orderA > orderB) return 1;
            return 0;
          });

        // Insert at the end of the folder
        const lastChild = targetChildren[targetChildren.length - 1];
        try {
          newSortOrder = generateKeyBetween(lastChild?.sortOrder || null, null);
        } catch {
          // 如果生成失败（达到上限），触发重新排序
          return {
            success: false,
            error: new DragDropError(DragDropErrorCode.INVALID_OPERATION, 'REORDER_NEEDED')
          };
        }
      } else {
        // Dropping before or after target (same level)
        newParentId = targetItem.parentId ?? null;

        // Get siblings at the same level
        const sameLevelSiblings = siblings
          .filter(m => m.parentId === newParentId)
          .sort((a, b) => {
            const orderA = a.sortOrder || '';
            const orderB = b.sortOrder || '';
            if (orderA < orderB) return -1;
            if (orderA > orderB) return 1;
            return 0;
          });

        const targetIndex = sameLevelSiblings.findIndex(m => m.id === targetItem.id);

        try {
          if (dropMode === 'before') {
            const prevItem = sameLevelSiblings[targetIndex - 1];
            newSortOrder = generateKeyBetween(prevItem?.sortOrder || null, targetItem.sortOrder || null);
          } else {
            // 'after'
            const nextItem = sameLevelSiblings[targetIndex + 1];
            newSortOrder = generateKeyBetween(targetItem.sortOrder || null, nextItem?.sortOrder || null);
          }
        } catch {
          // 如果生成失败（达到上限），触发重新排序
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
   * Perform the drop operation by updating the menu item
   *
   * @param draggedItem - The item being dragged
   * @param dropResult - The result from calculateDropPosition
   * @returns Promise resolving to the updated drop result
   */
  async performDrop<T extends DraggableMenu>(draggedItem: T, dropResult: DropResult): Promise<DropResult> {
    if (!dropResult.success || !dropResult.newSortOrder) {
      return dropResult;
    }

    try {
      // Update the menu item with new sort order and parent ID
      draggedItem.sortOrder = dropResult.newSortOrder;
      if (dropResult.newParentId !== undefined) {
        const parentId = (dropResult.newParentId ?? undefined) as typeof draggedItem.parentId;
        draggedItem.parentId = parentId;
      }
      await draggedItem.save();

      return {
        success: true,
        newSortOrder: dropResult.newSortOrder,
        newParentId: dropResult.newParentId
      };
    } catch (error) {
      return {
        success: false,
        error: new DragDropError(
          DragDropErrorCode.SAVE_FAILED,
          `Failed to save menu item: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      };
    }
  }

  /**
   * Check if a menu item is a valid drop target
   *
   * @param draggedItem - The item being dragged
   * @param targetItem - The potential target item
   * @param dropMode - The drop mode
   * @param allMenus - All menu items
   * @returns True if target is valid, false otherwise
   */
  isValidDropTarget(
    draggedItem: DraggableMenu,
    targetItem: DraggableMenu,
    dropMode: DropMode,
    allMenus: readonly DraggableMenu[]
  ): boolean {
    // Cannot drop on itself
    if (draggedItem.id === targetItem.id) {
      return false;
    }

    // Prevent dragging into own descendants (circular reference check)
    // This check applies to ALL modes (before/after/into)
    if (this.isDescendantOf(targetItem, draggedItem, allMenus)) {
      return false;
    }

    // For 'into' mode, use canDropInto validation
    if (dropMode === 'into') {
      return this.canDropInto(draggedItem, targetItem, allMenus);
    }

    // For 'before'/'after' mode, all items are treated as folders
    return true;
  }

  /**
   * Check if a menu item is a descendant of another item
   *
   * @param item - The item to check
   * @param potentialAncestor - The potential ancestor
   * @param allMenus - All menu items (needed for traversal)
   * @returns True if item is a descendant of potentialAncestor
   */
  isDescendantOf<T extends DraggableMenu>(item: T, potentialAncestor: T, allMenus: readonly T[]): boolean {
    let currentItem: T | undefined = item;

    // Traverse up the parent chain
    while (currentItem?.parentId != null) {
      if (currentItem.parentId === potentialAncestor.id) {
        return true;
      }

      // Find parent in allMenus
      currentItem = allMenus.find(m => m.id === currentItem!.parentId);
    }

    return false;
  }
}
