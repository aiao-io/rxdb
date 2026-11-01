import type { UUID } from '@aiao/rxdb';
import {
  nextGridFocus,
  resolveKeyboardMove,
  resolveMenuMove,
  type BoardMoveDirection,
  type CardDropTarget,
  type Task
} from '@aiao/rxdb-plugin-board';
import type { KeyboardEvent } from 'react';

import type { ModelGetter, TriggerEvent } from './model.js';
import { errorText, FOCUS_KEYS, MOVE_KEYS } from './types.js';
import type { BoardData } from './use-board-data.js';
import { useStateRef } from './use-state-ref.js';
import type { ViewCore } from './use-view-core.js';

/** 卡片：菜单、就地改标题、移动（菜单 / 键盘 / 拖拽共用执行）、删除、键盘体系。 */
export interface CardModel {
  readonly editingTaskId: UUID | null;
  readonly taskTitleDraft: string;
  readonly setTaskTitleDraft: (value: string) => void;
  readonly openTaskMenu: (event: TriggerEvent, task: Task) => void;
  readonly startTaskTitle: (task: Task) => void;
  readonly commitTaskTitle: (task: Task) => Promise<void>;
  readonly cancelTaskTitle: (event?: { stopPropagation(): void }) => void;
  readonly onTaskTitleKeydown: (event: KeyboardEvent<HTMLInputElement>, task: Task) => void;
  readonly openMovePicker: (task: Task) => void;
  readonly moveTaskBy: (task: Task, direction: BoardMoveDirection) => Promise<void>;
  readonly confirmTaskDelete: (task: Task) => Promise<void>;
  /** 卡片键盘：方向键移焦点、Alt + 方向键移卡片、Enter / Space 详情、F2 改名、Del 删除、Shift+F10 菜单。 */
  readonly onCardKeydown: (event: KeyboardEvent<HTMLElement>, task: Task) => void;
  /** 执行移动；成功后同步详情基线并给出可撤销提示。 */
  readonly executeTaskMove: (taskId: UUID, target: CardDropTarget) => Promise<boolean>;
  /** 移到目标列末尾（与 GitHub「Move to column」一致）；从详情侧栏发起时焦点留在侧栏。 */
  readonly moveTaskToColumn: (taskId: UUID, columnId: UUID, focusCard: boolean) => Promise<void>;
}

/** 卡片。 */
export const useCardModel = (core: ViewCore, data: BoardData, model: ModelGetter): CardModel => {
  const [editingTaskId, setEditingTaskId, editingTaskIdRef] = useStateRef<UUID | null>(null);
  const [taskTitleDraft, setTaskTitleDraft, taskTitleDraftRef] = useStateRef('');
  const actions = () => core.boardRef.current.actions;
  const closePopover = () => model().popover.closePopover(false);

  const executeTaskMove = async (taskId: UUID, target: CardDropTarget): Promise<boolean> => {
    core.setNotice(null);
    try {
      await actions().moveTask(taskId, target);
    } catch (error) {
      core.showNotice(errorText(error));
      return false;
    }
    model().detail.applyMovedColumn(taskId, target.columnId);
    core.showToast(`已移动到「${data.columnTitleOf(target.columnId)}」`, true);
    return true;
  };

  const moveTaskBy = async (task: Task, direction: BoardMoveDirection): Promise<void> => {
    closePopover();
    const target = resolveKeyboardMove(data.keyboardColumns(), task.id, direction);
    if (target === null) return;
    if (await executeTaskMove(task.id, target)) core.focusTaskSoon(task.id);
  };

  const confirmTaskDelete = async (task: Task): Promise<void> => {
    closePopover();
    const plan = await core.guard(() => actions().planTaskDelete(task.id));
    if (plan) model().dialog.openDialog({ kind: 'confirm-delete', plan });
  };

  const startTaskTitle = (task: Task): void => {
    closePopover();
    setTaskTitleDraft(task.title);
    setEditingTaskId(task.id);
    core.focusSoon('[data-testid="task-title-editor"]');
  };

  const commitTaskTitle = async (task: Task): Promise<void> => {
    const saved = await core.guard(() => actions().updateTaskTitle(task.id, taskTitleDraftRef.current));
    // 失败保留编辑器与草稿（US-539 交互约定「失败保留草稿」）
    if (saved === undefined) return;
    setEditingTaskId(null);
    core.focusTaskSoon(task.id);
  };

  const cancelTaskTitle = (event?: { stopPropagation(): void }): void => {
    event?.stopPropagation();
    const taskId = editingTaskIdRef.current;
    setEditingTaskId(null);
    if (taskId !== null) core.focusTaskSoon(taskId);
  };

  const runCardCommand = (event: KeyboardEvent<HTMLElement>, task: Task): boolean => {
    if (event.key === 'Enter' || event.key === ' ') {
      void model().detail.openDetail(task.id);
      return true;
    }
    if (event.key === 'F2') {
      startTaskTitle(task);
      return true;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      core.setReturnFocus(event.currentTarget);
      void confirmTaskDelete(task);
      return true;
    }
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return false;
    model().popover.openMenuAt('task-menu', task.id, event.currentTarget);
    return true;
  };

  const runCardKey = (event: KeyboardEvent<HTMLElement>, task: Task): boolean => {
    const move = event.altKey ? MOVE_KEYS[event.key] : undefined;
    if (move !== undefined) {
      void moveTaskBy(task, move);
      return true;
    }
    const direction = event.altKey ? undefined : FOCUS_KEYS[event.key];
    if (direction === undefined) return runCardCommand(event, task);
    const next = nextGridFocus(data.gridColumns(), task.id, direction);
    if (next !== null) core.focusTaskSoon(next);
    return true;
  };

  return {
    editingTaskId,
    taskTitleDraft,
    setTaskTitleDraft,
    openTaskMenu: (event, task) => model().popover.togglePopover('task-menu', task.id, event),
    startTaskTitle,
    commitTaskTitle,
    cancelTaskTitle,
    onTaskTitleKeydown: (event, task) => {
      if (event.key === 'Enter') void commitTaskTitle(task);
      if (event.key === 'Escape') cancelTaskTitle(event);
    },
    openMovePicker: task => model().popover.openChildPicker('move-picker', task.id, [task.columnId]),
    moveTaskBy,
    confirmTaskDelete,
    onCardKeydown: (event, task) => {
      if (event.target !== event.currentTarget || !runCardKey(event, task)) return;
      event.preventDefault();
      event.stopPropagation();
    },
    executeTaskMove,
    moveTaskToColumn: async (taskId, columnId, focusCard) => {
      const column = data.menuColumns().find(view => view.columnId === columnId);
      const target = resolveMenuMove(data.menuColumns(), taskId, columnId, column?.taskIds.length ?? 0);
      if (target === null) return;
      if ((await executeTaskMove(taskId, target)) && focusCard) core.focusTaskSoon(taskId);
    }
  };
};
