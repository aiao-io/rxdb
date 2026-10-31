import type { UUID } from '@aiao/rxdb';
import {
  dropIndicatorAnchor,
  resolveCardDrop,
  resolveColumnDrop,
  type CardDropColumnView,
  type CardDropTarget,
  type Column,
  type Task
} from '@aiao/rxdb-plugin-board';
import type { DragEvent } from 'react';

import type { ModelGetter } from './model.js';
import type { DragState, DropFeedback } from './types.js';
import type { BoardData } from './use-board-data.js';
import { useStateRef } from './use-state-ref.js';
import type { ViewCore } from './use-view-core.js';

const TASK_TYPE = 'application/x-board-task';
const COLUMN_TYPE = 'application/x-board-column';

/** 拖拽：卡片跨列 / 列内改序、列改序，带插入线 / 列高亮 / 源半透明反馈。 */
export interface DragModel {
  readonly onTaskDragStart: (event: DragEvent<HTMLElement>, task: Task) => void;
  /** 根层 dragover：只处理卡片拖拽（列头 handler 冒泡上来时按类型分流）。 */
  readonly onTaskDragOver: (event: DragEvent<HTMLElement>) => void;
  readonly onColumnDragStart: (event: DragEvent<HTMLElement>, column: Column) => void;
  /** 列 dragover：只处理列拖拽。 */
  readonly onColumnDragOver: (event: DragEvent<HTMLElement>) => void;
  /** 列 drop：卡片落点；列拖拽冒泡到这里时不清理拖拽态（根层的列落点还要用）。 */
  readonly onTaskDrop: (event: DragEvent<HTMLElement>) => Promise<void>;
  /** 根层 drop：列落点。 */
  readonly onColumnDrop: (event: DragEvent<HTMLElement>) => Promise<void>;
  readonly clearDragFeedback: () => void;
  readonly isDropBefore: (task: Task) => boolean;
  readonly isDropAfter: (task: Task) => boolean;
  readonly isDropEnd: (column: Column) => boolean;
  readonly isDropColumn: (column: Column) => boolean;
  readonly isColumnDropBefore: (column: Column) => boolean;
  readonly isColumnDropAfter: (column: Column) => boolean;
  readonly isDraggingTask: (task: Task) => boolean;
  readonly isDraggingColumn: (column: Column) => boolean;
}

const sameFeedback = (a: DropFeedback | null, b: DropFeedback | null): boolean =>
  a === b || (a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b));

/** 插入线只挂在可见卡片上：筛选隐藏了相邻卡片时换挂另一侧，两侧都不可见则画在列尾。 */
const toFeedback = (target: CardDropTarget | null, views: readonly CardDropColumnView[]): DropFeedback | null => {
  if (target === null) return null;
  const visibleIds = (views.find(view => view.columnId === target.columnId)?.cards ?? []).map(card => card.id);
  const anchor = dropIndicatorAnchor(target, visibleIds);
  return anchor === null ?
      { kind: 'task-end', columnId: target.columnId }
    : { kind: 'task', columnId: target.columnId, ...anchor };
};

/** 拖拽（只采集指针事件，落点由核心包换算）。 */
export const useDragModel = (core: ViewCore, data: BoardData, model: ModelGetter): DragModel => {
  const [dragging, setDragging, draggingRef] = useStateRef<DragState | null>(null);
  const [dropTarget, setDropTargetState, dropTargetRef] = useStateRef<DropFeedback | null>(null);
  const columns = () => core.boardRef.current.columns;

  const setDropTarget = (next: DropFeedback | null): void => {
    if (!sameFeedback(dropTargetRef.current, next)) setDropTargetState(next);
  };
  const clearDragFeedback = (): void => {
    setDragging(null);
    setDropTarget(null);
  };

  /**
   * 几何只取可见卡片，邻居取完整序列（筛选隐藏的兄弟不被夹在两个邻居之间）。
   * 每次 dragover 现量：落点指示是伪元素 / 阴影、不触发重排，读的是干净布局；拖拽开始时缓存会在拖拽自动滚动后失效。
   */
  const columnViews = (area: HTMLElement): CardDropColumnView[] =>
    columns().map(column => {
      const rect = area.querySelector<HTMLElement>(`[data-column-id="${column.id}"]`)?.getBoundingClientRect();
      const cards = data.visibleTasksOf(column).flatMap(task => {
        const cardRect = area.querySelector<HTMLElement>(`[data-task-id="${task.id}"]`)?.getBoundingClientRect();
        return cardRect ? [{ id: task.id, top: cardRect.top, bottom: cardRect.bottom }] : [];
      });
      return {
        columnId: column.id,
        rect: { left: rect?.left ?? 0, right: rect?.right ?? 0, top: rect?.top ?? 0, bottom: rect?.bottom ?? 0 },
        cards,
        taskIds: data.tasksOf(column).map(task => task.id)
      };
    });

  const resolveColumnTarget = (movedId: UUID, clientX: number) => {
    const area = core.areaRef.current;
    const views = columns().map(column => {
      const rect = area?.querySelector<HTMLElement>(`[data-column-header-id="${column.id}"]`)?.getBoundingClientRect();
      return { columnId: column.id, rect: { left: rect?.left ?? 0, right: rect?.right ?? 0 } };
    });
    return resolveColumnDrop(
      views,
      columns().map(column => column.id),
      movedId,
      clientX
    );
  };

  return {
    onTaskDragStart: (event, task) => {
      event.dataTransfer?.setData(TASK_TYPE, task.id);
      model().popover.closePopover(false);
      setDragging({ kind: 'task', id: task.id });
    },
    onTaskDragOver: event => {
      event.preventDefault();
      const current = draggingRef.current;
      const area = core.areaRef.current;
      if (current?.kind !== 'task' || !area) return;
      const views = columnViews(area);
      setDropTarget(toFeedback(resolveCardDrop(views, current.id, event.clientX, event.clientY), views));
    },
    onColumnDragStart: (event, column) => {
      event.dataTransfer?.setData(COLUMN_TYPE, column.id);
      model().popover.closePopover(false);
      setDragging({ kind: 'column', id: column.id });
    },
    onColumnDragOver: event => {
      event.preventDefault();
      const current = draggingRef.current;
      if (current?.kind !== 'column') return;
      const target = resolveColumnTarget(current.id, event.clientX);
      const anchorId = target === null ? null : (target.prevId ?? target.nextId);
      setDropTarget(
        target === null || anchorId === null ?
          null
        : { kind: 'column', columnId: anchorId, mode: target.prevId === null ? 'before' : 'after' }
      );
    },
    onTaskDrop: async event => {
      event.preventDefault();
      const current = draggingRef.current;
      const movedId = (event.dataTransfer?.getData(TASK_TYPE) ||
        (current?.kind === 'task' ? current.id : undefined)) as UUID | undefined;
      if (!movedId) return;
      const area = core.areaRef.current;
      clearDragFeedback();
      if (!area) return;
      const target = resolveCardDrop(columnViews(area), movedId, event.clientX, event.clientY);
      if (target) await model().cards.executeTaskMove(movedId, target);
    },
    onColumnDrop: async event => {
      event.preventDefault();
      const current = draggingRef.current;
      const movedId = (event.dataTransfer?.getData(COLUMN_TYPE) ||
        (current?.kind === 'column' ? current.id : undefined)) as UUID | undefined;
      clearDragFeedback();
      if (!movedId) return;
      const target = resolveColumnTarget(movedId, event.clientX);
      if (target) await core.guard(() => core.boardRef.current.actions.moveColumn(movedId, target));
    },
    clearDragFeedback,
    isDropBefore: task => dropTarget?.kind === 'task' && dropTarget.taskId === task.id && dropTarget.mode === 'before',
    isDropAfter: task => dropTarget?.kind === 'task' && dropTarget.taskId === task.id && dropTarget.mode === 'after',
    isDropEnd: column => dropTarget?.kind === 'task-end' && dropTarget.columnId === column.id,
    isDropColumn: column => dropTarget !== null && dropTarget.kind !== 'column' && dropTarget.columnId === column.id,
    isColumnDropBefore: column =>
      dropTarget?.kind === 'column' && dropTarget.columnId === column.id && dropTarget.mode === 'before',
    isColumnDropAfter: column =>
      dropTarget?.kind === 'column' && dropTarget.columnId === column.id && dropTarget.mode === 'after',
    isDraggingTask: task => dragging?.kind === 'task' && dragging.id === task.id,
    isDraggingColumn: column => dragging?.kind === 'column' && dragging.id === column.id
  };
};
