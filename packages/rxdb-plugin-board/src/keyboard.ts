import { reorderTargetForDrop, type UUID } from '@aiao/rxdb';

import { resolveMenuMove, type CardDropTarget, type MenuMoveColumnView } from './drop-resolution.js';

/**
 * @fileoverview 看板键盘体系（看板 v2，GitHub Projects 同款网格导航）
 *
 * 方向键在卡片间移动焦点、Alt + 方向键移动卡片；三端只把按键映射成方向，
 * 目标由这里的纯函数换算，移动目标与拖拽 / 菜单移动共用 {@link CardDropTarget} 语义。
 */

/** 焦点移动方向：上下同列、左右跨列、首尾（Home / End）。 */
export type BoardGridDirection = 'up' | 'down' | 'left' | 'right' | 'first' | 'last';

/** 卡片移动方向（Alt + 方向键）。 */
export type BoardMoveDirection = 'up' | 'down' | 'left' | 'right';

/** 网格导航的列：可见卡片序列（筛选后的顺序）。 */
export interface BoardGridColumn {
  readonly columnId: UUID;
  readonly taskIds: readonly UUID[];
}

/** 键盘移动的列：完整任务序列 + 可见序列（筛选隐藏的卡片只在完整序列里）。 */
export interface BoardKeyboardColumn extends MenuMoveColumnView {
  readonly visibleIds: readonly UUID[];
}

const locate = (columns: readonly BoardGridColumn[], taskId: UUID): { column: number; index: number } | null => {
  const column = columns.findIndex(view => view.taskIds.includes(taskId));
  return column < 0 ? null : { column, index: columns[column].taskIds.indexOf(taskId) };
};

/** 左右方向最近的非空列下标；没有返回 `-1`。 */
const nearestNonEmpty = (columns: readonly BoardGridColumn[], from: number, step: 1 | -1): number => {
  for (let column = from + step; column >= 0 && column < columns.length; column += step) {
    if (columns[column].taskIds.length > 0) return column;
  }
  return -1;
};

/**
 * 焦点移动目标：上下在同列移动、到边界停住；左右跳到最近的非空列同一行（短列取末张）。
 *
 * @returns 目标卡片 id；没有目标（边界或未知卡片）返回 `null`
 */
export const nextGridFocus = (
  columns: readonly BoardGridColumn[],
  currentId: UUID,
  direction: BoardGridDirection
): UUID | null => {
  const at = locate(columns, currentId);
  if (at === null) return null;
  const ids = columns[at.column].taskIds;
  if (direction === 'first') return ids[0];
  if (direction === 'last') return ids[ids.length - 1];
  if (direction === 'up' || direction === 'down') return ids[at.index + (direction === 'up' ? -1 : 1)] ?? null;
  const target = nearestNonEmpty(columns, at.column, direction === 'left' ? -1 : 1);
  if (target < 0) return null;
  const targetIds = columns[target].taskIds;
  return targetIds[Math.min(at.index, targetIds.length - 1)];
};

const between = (columnId: UUID, target: { prevId: UUID | null; nextId: UUID | null } | null): CardDropTarget | null =>
  target === null ? null : { kind: 'between', columnId, prevId: target.prevId, nextId: target.nextId };

/** 相邻列同一行：插在可见同行卡片之前；目标列更短则排到最后一张可见卡之后。 */
const acrossTarget = (column: BoardKeyboardColumn, movedId: UUID, row: number): CardDropTarget | null => {
  const visible = column.visibleIds;
  if (visible.length === 0) return resolveMenuMove([column], movedId, column.columnId, column.taskIds.length);
  const anchor = visible[Math.min(row, visible.length - 1)];
  const position = row < visible.length ? 'before' : 'after';
  return between(column.columnId, reorderTargetForDrop(column.taskIds, movedId, anchor, position));
};

/**
 * Alt + 方向键移动目标：上下越过同列相邻的可见卡片，左右移到相邻列的同一行（相邻空列直接追加）。
 *
 * @remarks
 * 邻居取自完整任务序列（与 `resolveCardDrop` 同一语义），筛选隐藏的兄弟不会被夹在两个邻居之间。
 *
 * @returns 移动目标；边界、原位或被移动卡片自身不可见（没有「同一行」可言）返回 `null`（调用方零写）
 */
export const resolveKeyboardMove = (
  columns: readonly BoardKeyboardColumn[],
  movedId: UUID,
  direction: BoardMoveDirection
): CardDropTarget | null => {
  const source = columns.findIndex(column => column.taskIds.includes(movedId));
  if (source < 0) return null;
  const column = columns[source];
  const row = column.visibleIds.indexOf(movedId);
  if (row < 0) return null;
  if (direction === 'up' || direction === 'down') {
    const anchor = column.visibleIds[row + (direction === 'up' ? -1 : 1)];
    if (anchor === undefined) return null;
    const position = direction === 'up' ? 'before' : 'after';
    return between(column.columnId, reorderTargetForDrop(column.taskIds, movedId, anchor, position));
  }
  const target = columns[source + (direction === 'left' ? -1 : 1)];
  return target === undefined ? null : acrossTarget(target, movedId, row);
};
