import type { StorageBrowserItem } from './utils/storage-utils';

export type ViewMode = 'list' | 'grid';

export interface ConfirmDialog {
  show: boolean;
  message: string;
  resolve?: (value: boolean) => void;
}

export interface DeleteConfirm {
  show: boolean;
  entry: StorageBrowserItem | null;
  resolve?: (value: boolean) => void;
}

export interface RenameDialog {
  show: boolean;
  entry: StorageBrowserItem | null;
  newName: string;
}

export interface OverwriteConfirm {
  show: boolean;
  file: File | null;
  existingEntry: StorageBrowserItem | null;
  resolve?: (value: boolean) => void;
}

export interface ContextMenuState {
  show: boolean;
  x: number;
  y: number;
  entry: StorageBrowserItem | null;
}

export interface ToastState {
  show: boolean;
  message: string;
  type: 'error' | 'success' | 'info';
}

export interface SelectionBox {
  active: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}
