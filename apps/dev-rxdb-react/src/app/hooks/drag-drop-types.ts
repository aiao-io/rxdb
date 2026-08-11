/**
 * Drag-drop type definitions for menu drag and drop operations
 */
import type { RxDBEntityId } from '@aiao/rxdb';

/**
 * Drop mode indicating where the item will be dropped
 */
export type DropMode = 'before' | 'after' | 'into';

/**
 * Drop position enum (alias for DropMode for consistency with documentation)
 */
export enum DropPosition {
  BEFORE = 'before', // 插入到目标节点上方（同级）
  INSIDE = 'into', // 作为目标节点的子节点
  AFTER = 'after' // 插入到目标节点下方（同级）
}

/**
 * Drop indicator interface for visual feedback
 */
export interface DropIndicator {
  /** 目标节点 ID */
  targetId: string;
  /** 放置位置 */
  position: DropPosition;
}

/**
 * Error codes for drag-drop operations
 */
export enum DragDropErrorCode {
  /** Attempting to drop an item into itself */
  SELF_DROP = 'SELF_DROP',
  /** Attempting to drop a folder into its descendant (circular nesting) */
  CIRCULAR_NESTING = 'CIRCULAR_NESTING',
  /** Target is not a valid folder */
  INVALID_TARGET = 'INVALID_TARGET',
  /** Failed to save changes to database */
  SAVE_FAILED = 'SAVE_FAILED',
  /** Invalid drop operation */
  INVALID_OPERATION = 'INVALID_OPERATION'
}

/**
 * Custom error for drag-drop operations
 */
export class DragDropError extends Error {
  constructor(
    public code: DragDropErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'DragDropError';
  }
}

/**
 * Result of a drop operation
 */
export interface DropResult {
  /** Whether the drop operation was successful */
  success: boolean;
  /** New sort order key assigned to the dropped item */
  newSortOrder?: string;
  /** New parent ID if the item was moved to a different parent */
  newParentId?: RxDBEntityId | null;
  /** Error if the operation failed */
  error?: DragDropError;
}

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
