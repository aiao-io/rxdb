/**
 * rxdb-plugin-board-angular - Angular 集成层
 *
 * 提供 `useBoard()`：看板领域数据 signal + 领域动作集合，
 * 全部写入口经核心包服务（校验、恢复中写门禁、事务原子性）。
 * 命名与 React / Vue 绑定层一致。
 *
 * @packageDocumentation
 */

export { useBoard, LAST_BOARD_KEY, type UseBoardActions, type UseBoardOptions, type UseBoardReturn, type UseBoardStorage } from './use-board.js';
export { BoardViewComponent } from './board-view.js';
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
