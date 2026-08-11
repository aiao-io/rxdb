import type { RxDBEntityId } from '@aiao/rxdb';

export type DropMode = 'before' | 'after' | 'into';

export interface DragDropState {
  draggedItemId: RxDBEntityId | null;
  targetItemId: RxDBEntityId | null;
  dropMode: DropMode | null;
  isValidTarget: boolean;
  dragStartTime?: number;
}

export enum DragDropErrorCode {
  INVALID_OPERATION = 'INVALID_OPERATION',
  CIRCULAR_DEPENDENCY = 'CIRCULAR_DEPENDENCY',
  SAME_NODE = 'SAME_NODE'
}

export class DragDropError extends Error {
  constructor(
    public code: DragDropErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'DragDropError';
  }
}

export interface DropResult {
  success: boolean;
  newSortOrder?: string;
  newParentId?: RxDBEntityId | null;
  error?: DragDropError;
}
