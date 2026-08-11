import { ISortableTreeEntity, type RxDBEntityId } from '@aiao/rxdb';
import { computed, ref, unref, type MaybeRef } from 'vue';
import { DragDropState, DropMode } from './drag-drop-types';
import { useDragDropService } from './useDragDropService';

const DROP_ZONE_THRESHOLD = 0.33; // 33% from top/bottom for before/after zones

export interface SavableSortableTreeEntity extends ISortableTreeEntity {
  save(): Promise<unknown>;
}

export interface DragDropOptions<T> {
  isFolder?: (item: T) => boolean;
}

export function useDragDrop<T extends SavableSortableTreeEntity>(
  allItems: MaybeRef<T[]>,
  options: DragDropOptions<T> = {}
) {
  const dragDropService = useDragDropService();

  const dragDropState = ref<DragDropState>({
    draggedItemId: null,
    targetItemId: null,
    dropMode: null,
    isValidTarget: false
  });

  // Get all descendants of a node
  const getDescendants = (itemId: RxDBEntityId): Set<RxDBEntityId> => {
    const descendants = new Set<RxDBEntityId>();
    const queue: RxDBEntityId[] = [itemId];
    const items = unref(allItems);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const children = items.filter(m => m.parentId === currentId);
      children.forEach(child => {
        descendants.add(child.id);
        queue.push(child.id);
      });
    }

    return descendants;
  };

  // Calculate drop mode based on mouse position
  const calculateDropMode = (mouseY: number, rect: DOMRect): DropMode => {
    const relativeY = mouseY - rect.top;
    const height = rect.height;

    if (relativeY < height * DROP_ZONE_THRESHOLD) {
      return 'before';
    } else if (relativeY > height * (1 - DROP_ZONE_THRESHOLD)) {
      return 'after';
    } else {
      return 'into';
    }
  };

  // Validate if drop is allowed
  const validateDrop = (draggedItem: T | undefined, targetItem: T, dropMode: DropMode): boolean => {
    if (!draggedItem) return false;

    // Cannot drop on itself
    if (draggedItem.id === targetItem.id) {
      return false;
    }

    // For 'into' mode, check circular nesting and if target is a folder
    if (dropMode === 'into') {
      if (options.isFolder && !options.isFolder(targetItem)) {
        return false;
      }
      return dragDropService.canDropInto(draggedItem, targetItem, unref(allItems));
    }

    return true;
  };

  const highlightedMenuIds = computed(() => {
    if (!dragDropState.value.draggedItemId) return new Set<RxDBEntityId>();
    return getDescendants(dragDropState.value.draggedItemId);
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
    const items = unref(allItems);
    const draggedItem = items.find(m => m.id === dragDropState.value.draggedItemId);
    if (!draggedItem) return { isValid: false };

    const dropMode = calculateDropMode(mouseY, rect);
    const isValid = validateDrop(draggedItem, targetItem, dropMode);

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

  const onDrop = async (targetItem: T, onComplete?: (newParentId: RxDBEntityId) => void) => {
    const { draggedItemId, dropMode, isValidTarget } = dragDropState.value;
    const items = unref(allItems);
    const draggedItem = items.find(m => m.id === draggedItemId);

    if (!draggedItem || !dropMode || !isValidTarget) {
      resetState();
      return null;
    }

    const result = dragDropService.calculateDropPosition(draggedItem, targetItem, dropMode, items);

    if (result.success && result.newSortOrder) {
      draggedItem.sortOrder = result.newSortOrder;
      draggedItem.parentId = result.newParentId as typeof draggedItem.parentId;
      await draggedItem.save();

      if (onComplete && result.newParentId) {
        onComplete(result.newParentId);
      }
    }

    resetState();
    return {
      ...result,
      draggedItem
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
