/**
 * Drag-drop type definitions for file manager drag and drop operations
 */

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
 * State tracking during drag operation
 */
export interface DragDropState {
  /** ID of the item being dragged */
  draggedItemId: string | null;
  /** ID of the current drop target */
  targetItemId: string | null;
  /** Current drop mode (before/after/into) */
  dropMode: DropMode | null;
  /** Whether the current drop target is valid */
  isValidTarget: boolean;
  /** Timestamp when drag started */
  dragStartTime?: number;
}
