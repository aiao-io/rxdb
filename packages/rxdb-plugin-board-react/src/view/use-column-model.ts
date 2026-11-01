import type { UUID } from '@aiao/rxdb';
import type { Column } from '@aiao/rxdb-plugin-board';
import { useState, type KeyboardEvent } from 'react';

import type { ModelGetter, TriggerEvent } from './model.js';
import type { BoardData } from './use-board-data.js';
import { useStateRef } from './use-state-ref.js';
import type { ViewCore } from './use-view-core.js';

/** 停止冒泡的最小事件（Esc 取消时不让 document 级 Esc 再关闭外层）。 */
interface StoppableEvent {
  stopPropagation(): void;
}

/** 列：菜单、改名、本列排序、左右移、列底建任务、末尾建列。 */
export interface ColumnModel {
  readonly editingColumnId: UUID | null;
  readonly columnTitleDraft: string;
  readonly addingColumn: boolean;
  readonly addColumnTitle: string;
  readonly addTaskColumnId: UUID | null;
  readonly addTaskTitle: string;
  readonly creatingTask: boolean;
  readonly sortingColumnId: UUID | null;
  readonly setColumnTitleDraft: (value: string) => void;
  readonly setAddColumnTitle: (value: string) => void;
  readonly setAddTaskTitle: (value: string) => void;
  readonly openColumnMenu: (event: TriggerEvent, column: Column) => void;
  readonly startColumnTitle: (columnId: UUID) => void;
  readonly commitColumnTitle: () => Promise<void>;
  readonly onColumnTitleKeydown: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly sortColumnBy: (columnId: UUID, mode: 'dueDate' | 'title') => Promise<void>;
  readonly moveColumnBy: (columnId: UUID, direction: -1 | 1) => Promise<void>;
  readonly confirmColumnDelete: (column: Column) => Promise<void>;
  readonly openAddColumn: () => void;
  readonly commitAddColumn: () => Promise<void>;
  readonly cancelAddColumn: (event?: StoppableEvent) => void;
  readonly onAddColumnKeydown: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly openAddTask: (columnId: UUID) => void;
  readonly cancelAddTask: (event?: StoppableEvent) => void;
  /** 列底建任务（GitHub 同款）：回车即建，输入框保持打开以便连续录入。 */
  readonly commitAddTask: () => Promise<void>;
  readonly onAddTaskKeydown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

/** 列。 */
export const useColumnModel = (core: ViewCore, data: BoardData, model: ModelGetter): ColumnModel => {
  const [editingColumnId, setEditingColumnId, editingColumnIdRef] = useStateRef<UUID | null>(null);
  const [columnTitleDraft, setColumnTitleDraft, columnTitleDraftRef] = useStateRef('');
  const [addingColumn, setAddingColumn] = useState(false);
  const [addColumnTitle, setAddColumnTitle, addColumnTitleRef] = useStateRef('');
  const [addTaskColumnId, setAddTaskColumnId, addTaskColumnIdRef] = useStateRef<UUID | null>(null);
  const [addTaskTitle, setAddTaskTitle, addTaskTitleRef] = useStateRef('');
  const [creatingTask, setCreatingTask, creatingTaskRef] = useStateRef(false);
  const [sortingColumnId, setSortingColumnId, sortingColumnIdRef] = useStateRef<UUID | null>(null);
  const actions = () => core.boardRef.current.actions;
  const closePopover = (restoreFocus?: boolean) => model().popover.closePopover(restoreFocus);

  const commitColumnTitle = async (): Promise<void> => {
    const columnId = editingColumnIdRef.current;
    if (columnId === null) return;
    setEditingColumnId(null);
    const title = columnTitleDraftRef.current;
    if (title.trim() === data.columnTitleOf(columnId)) return;
    const saved = await core.guard(() => actions().updateColumn(columnId, { title }));
    if (saved === undefined) setEditingColumnId(columnId);
  };

  const commitAddColumn = async (): Promise<void> => {
    const title = addColumnTitleRef.current.trim();
    if (title === '') return;
    const created = await core.guard(() => actions().createColumn({ title }));
    if (created === undefined) return;
    setAddingColumn(false);
    setAddColumnTitle('');
  };
  const cancelAddColumn = (event?: StoppableEvent): void => {
    event?.stopPropagation();
    setAddingColumn(false);
  };

  const commitAddTask = async (): Promise<void> => {
    const columnId = addTaskColumnIdRef.current;
    const title = addTaskTitleRef.current.trim();
    if (creatingTaskRef.current || columnId === null || title === '') return;
    setCreatingTask(true);
    try {
      const created = await core.guard(() => actions().createTask({ columnId, title }));
      if (created !== undefined) setAddTaskTitle('');
    } finally {
      setCreatingTask(false);
    }
    core.focusSoon('[data-testid="add-task-input"]');
  };
  const cancelAddTask = (event?: StoppableEvent): void => {
    event?.stopPropagation();
    if (creatingTaskRef.current) return;
    setAddTaskColumnId(null);
    setAddTaskTitle('');
  };

  return {
    editingColumnId,
    columnTitleDraft,
    addingColumn,
    addColumnTitle,
    addTaskColumnId,
    addTaskTitle,
    creatingTask,
    sortingColumnId,
    setColumnTitleDraft,
    setAddColumnTitle,
    setAddTaskTitle,
    openColumnMenu: (event, column) => model().popover.togglePopover('column-menu', column.id, event),
    startColumnTitle: columnId => {
      closePopover(false);
      setColumnTitleDraft(data.columnTitleOf(columnId));
      setEditingColumnId(columnId);
      core.focusSoon('[data-testid="column-title-editor"]');
    },
    commitColumnTitle,
    onColumnTitleKeydown: event => {
      if (event.key === 'Enter') void commitColumnTitle();
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setEditingColumnId(null);
    },
    sortColumnBy: async (columnId, mode) => {
      if (sortingColumnIdRef.current !== null) return;
      closePopover(false);
      setSortingColumnId(columnId);
      try {
        const result = await core.guard(() => actions().sortColumn(columnId, mode));
        if (!result) return;
        const label = mode === 'dueDate' ? '截止日' : '标题';
        core.showToast(
          result.written ? `已按${label}排序「${data.columnTitleOf(columnId)}」` : '已按目标顺序排列，无变化',
          result.written
        );
      } finally {
        setSortingColumnId(null);
      }
    },
    moveColumnBy: async (columnId, direction) => {
      closePopover(false);
      const ids = core.boardRef.current.columns.map(column => column.id);
      const index = ids.indexOf(columnId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= ids.length) return;
      const target =
        direction < 0 ?
          { prevId: ids[targetIndex - 1] ?? null, nextId: ids[targetIndex] }
        : { prevId: ids[targetIndex], nextId: ids[targetIndex + 1] ?? null };
      await core.guard(() => actions().moveColumn(columnId, target));
      core.focusSoon(`[data-column-header-id="${columnId}"] [data-testid="column-menu-trigger"]`);
    },
    confirmColumnDelete: async column => {
      closePopover(false);
      const plan = await core.guard(() => actions().planColumnDelete(column.id));
      if (plan) model().dialog.openDialog({ kind: 'confirm-delete', plan });
    },
    openAddColumn: () => {
      setAddColumnTitle('');
      setAddingColumn(true);
      core.focusSoon('[data-testid="column-composer-input"]');
    },
    commitAddColumn,
    cancelAddColumn,
    onAddColumnKeydown: event => {
      if (event.key === 'Enter') void commitAddColumn();
      if (event.key === 'Escape') cancelAddColumn(event);
    },
    openAddTask: columnId => {
      if (creatingTaskRef.current) return;
      setAddTaskColumnId(columnId);
      setAddTaskTitle('');
      core.focusSoon('[data-testid="add-task-input"]');
    },
    cancelAddTask,
    commitAddTask,
    onAddTaskKeydown: event => {
      if (event.key === 'Enter') void commitAddTask();
      if (event.key === 'Escape') cancelAddTask(event);
    }
  };
};
