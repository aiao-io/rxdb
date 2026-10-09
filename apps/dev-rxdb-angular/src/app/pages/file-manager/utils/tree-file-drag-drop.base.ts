/* eslint-disable @angular-eslint/prefer-inject */
import type { HistoryScopeAPI } from '@aiao/rxdb';
import { Directive, Signal } from '@angular/core';
import { FileTreeEntityConstructor, FileTreeInstance } from '../models/file-node.interface';
import { TreeFileBase } from './tree-file.base';
import { TreeFileDragDropStore } from './tree-file.store';

@Directive()
export abstract class TreeFileDragDropBase<C extends FileTreeEntityConstructor> extends TreeFileBase<C> {
  // 重写 store 类型为 TreeFileDragDropStore
  declare readonly store: TreeFileDragDropStore<C>;

  // Drag State Delegates
  get dragDropState() {
    return this.store.dragDropState;
  }
  get invalidTargets() {
    return this.store.invalidTargets;
  }
  get highlightedFileIds() {
    return this.store.highlightedFileIds;
  }

  constructor(
    store: TreeFileDragDropStore<C>,
    fileResource: { value: Signal<FileTreeInstance<C>[]> },
    entityClass: C,
    history: HistoryScopeAPI
  ) {
    super(store, fileResource, entityClass, history);
  }

  // Drag Event Handlers

  onDragStart(event: DragEvent, file: FileTreeInstance<C>): void {
    // 文件和文件夹都可以拖动
    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('text/plain', file.id);
    this.store.onDragStart(file.id);
  }

  onDragOver(event: DragEvent, file: FileTreeInstance<C>): void {
    event.preventDefault();
    event.stopPropagation();

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const result = this.store.onDragOver(file, event.clientY, rect);

    if (result.isValid) {
      event.dataTransfer!.dropEffect = 'move';
    } else {
      event.dataTransfer!.dropEffect = 'none';
    }
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    // 只有当真正离开节点时才清除状态（不是子元素切换）
    const relatedTarget = event.relatedTarget as HTMLElement;
    const currentTarget = event.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) {
      this.store.onDragLeave();
    }
  }

  async onDrop(event: DragEvent, file: FileTreeInstance<C>): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    // 失败只进页内提示（`拖放失败：…`）；拖拽状态由 store.onDrop 的 finally 复位
    const done = await this.runWrite('拖放', () => this.store.onDrop(file));

    // 自动滚动到目标节点
    if (done) this.scrollToFile(file.id);
  }

  onDragEnd(event: DragEvent): void {
    event.preventDefault();
    this.store.onDragEnd();
  }

  // Helper Methods

  scrollToFile(fileId: string): void {
    setTimeout(() => {
      const element = document.querySelector(`[data-file-id="${fileId}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
  }

  getDragState(fileId: string): string | null {
    const state = this.dragDropState();
    if (state.targetItemId !== fileId || !state.isValidTarget) {
      return null;
    }

    switch (state.dropMode) {
      case 'before':
        return 'drop-before';
      case 'after':
        return 'drop-after';
      case 'into':
        return 'drop-into';
      default:
        return null;
    }
  }

  /** 目标行的 `data-drop-mode`：拖动中的落点（before / after / into），非目标行为空串。 */
  dropModeAttr(fileId: string): string {
    const state = this.dragDropState();
    return state.targetItemId === fileId ? (state.dropMode ?? '') : '';
  }

  /** 目标行的 `data-drop-valid`：判定为 reject 时 `false`，否则 `true`；非目标行为空串。 */
  dropValidAttr(fileId: string): string {
    const state = this.dragDropState();
    return state.targetItemId === fileId ? String(state.isValidTarget) : '';
  }

  isInvalidTarget(fileId: string): boolean {
    return this.invalidTargets().has(fileId);
  }

  isHighlighted(fileId: string): boolean {
    return this.highlightedFileIds().has(fileId);
  }

  isDragging(fileId: string): boolean {
    return this.dragDropState().draggedItemId === fileId;
  }
}
