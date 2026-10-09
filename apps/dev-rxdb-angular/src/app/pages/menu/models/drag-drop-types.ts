import type { RxDBEntityId } from '@aiao/rxdb';

/**
 * Drag-drop type definitions for menu drag and drop operations
 */

/**
 * Drop mode indicating where the item will be dropped
 */
export type DropMode = 'before' | 'after' | 'into';

/**
 * State tracking during drag operation
 */
export interface DragDropState {
  /** ID of the item being dragged */
  draggedItemId: RxDBEntityId | null;
  /** ID of the current drop target */
  targetItemId: RxDBEntityId | null;
  /** Current drop mode (before/after/into) */
  dropMode: DropMode | null;
  /** Whether the current drop target is valid */
  isValidTarget: boolean;
  /** Timestamp when drag started */
  dragStartTime?: number;
}
