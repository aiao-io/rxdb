/**
 * rxdb-plugin-board-vue - Vue 集成层
 *
 * 提供 `useBoard()`：看板领域数据 ref + 领域动作集合。
 * 命名与 Angular / React 绑定层一致。
 *
 * @packageDocumentation
 */

export { useBoard, LAST_BOARD_KEY, type UseBoardActions, type UseBoardOptions, type UseBoardReturn, type UseBoardStorage } from './use-board.js';
export type {
  Board,
  BoardHostContext,
  BoardLabel,
  BoardWriteEvent,
  CardDropTarget,
  Column,
  ColumnSortMode,
  DeletePlan,
  LabelDeletePlan,
  SaveTaskDraftResult,
  Task,
  TaskDraft,
  TaskDraftSnapshot
} from '@aiao/rxdb-plugin-board';
export { BoardDomainError, resolveCardDrop, resolveColumnDrop } from '@aiao/rxdb-plugin-board';
