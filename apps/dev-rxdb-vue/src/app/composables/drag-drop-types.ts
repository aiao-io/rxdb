import type { RxDBEntityId } from '@aiao/rxdb';

export type DropMode = 'before' | 'after' | 'into';

export interface DragDropState {
  draggedItemId: RxDBEntityId | null;
  targetItemId: RxDBEntityId | null;
  dropMode: DropMode | null;
  isValidTarget: boolean;
  dragStartTime?: number;
}
