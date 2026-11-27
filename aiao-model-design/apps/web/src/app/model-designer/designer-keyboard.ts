import type { InteractionMode, ViewMode } from './interfaces/designer.interface';

/** 判断事件目标是否为编辑状态的输入元素 */
function isEditing(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** 键盘事件处理上下文 */
export interface KeyboardContext {
  interactionMode: () => InteractionMode;
  setInteractionMode: (mode: InteractionMode) => void;
  viewMode: () => ViewMode;
  undoCount: () => number;
  redoCount: () => number;
  selectedEntityIds: () => ReadonlySet<string>;
  onUndo: () => void;
  onRedo: () => void;
  onEntitiesDeleted: (ids: string[]) => void;
}

/** Space 键临时模式切换状态 */
export interface SpaceHoldState {
  isSpacePressed: boolean;
  tempModeBeforeSpace?: InteractionMode;
}

/** 处理 keydown 事件：Space 临时模式切换、Undo/Redo、Delete */
export function handleKeydown(e: KeyboardEvent, ctx: KeyboardContext, state: SpaceHoldState): void {
  if (e.code === 'Space' && !state.isSpacePressed && !isEditing(e)) {
    state.isSpacePressed = true;
    state.tempModeBeforeSpace = ctx.interactionMode();
    if (state.tempModeBeforeSpace === 'select') {
      e.preventDefault();
      ctx.setInteractionMode('move');
    }
    return;
  }

  const meta = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();

  if (meta && !e.shiftKey && key === 'z') {
    e.preventDefault();
    if (ctx.undoCount() > 0) ctx.onUndo();
    return;
  }

  if ((meta && e.shiftKey && key === 'z') || (meta && key === 'y')) {
    e.preventDefault();
    if (ctx.redoCount() > 0) ctx.onRedo();
    return;
  }

  // Delete/Backspace：仅在画布模式下删除实体，表格模式下由表格内部处理
  if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditing(e) && ctx.viewMode() === 'canvas') {
    const ids = [...ctx.selectedEntityIds()];
    if (ids.length > 0) {
      e.preventDefault();
      ctx.onEntitiesDeleted(ids);
    }
  }
}

/** 处理 keyup 事件：释放 Space 恢复原模式 */
export function handleKeyup(e: KeyboardEvent, ctx: KeyboardContext, state: SpaceHoldState): void {
  if (e.code === 'Space' && state.isSpacePressed) {
    state.isSpacePressed = false;
    if (state.tempModeBeforeSpace === 'select') {
      e.preventDefault();
      ctx.setInteractionMode('select');
    }
    state.tempModeBeforeSpace = undefined;
  }
}
