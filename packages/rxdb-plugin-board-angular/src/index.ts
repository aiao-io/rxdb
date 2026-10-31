/**
 * rxdb-plugin-board-angular - Angular 集成层
 *
 * 提供 `useBoard()`：看板领域数据 signal + 领域动作集合，
 * 全部写入口经核心包服务（校验、恢复中写门禁、事务原子性）；
 * `BoardViewComponent` 是看板视图，`BoardShellComponent` 是带启动选择与备份恢复的外壳。
 * 命名与 React / Vue 绑定层一致。
 *
 * @packageDocumentation
 */

export { BoardDomainError, resolveCardDrop, resolveColumnDrop } from '@aiao/rxdb-plugin-board';
export type {
  Board,
  BoardHostContext,
  BoardLabel,
  BoardSearchUnavailableReason,
  BoardShellOptions,
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
export { BoardShellComponent } from './board-shell.js';
export { BoardViewComponent } from './board-view.js';
export {
  LAST_BOARD_KEY,
  useBoard,
  type UseBoardActions,
  type UseBoardOptions,
  type UseBoardReturn,
  type UseBoardStorage
} from './use-board.js';
