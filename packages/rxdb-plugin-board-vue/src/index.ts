/**
 * rxdb-plugin-board-vue - Vue 集成层
 *
 * 提供 `useBoard()`：看板领域数据 ref + 领域动作集合；
 * `BoardView` 是看板视图，`BoardShell` 是带启动选择与备份恢复的外壳。
 * 命名与 Angular / React 绑定层一致。
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
export { default as BoardShell } from './board-shell.vue';
export { default as BoardView } from './board-view.vue';
export {
  LAST_BOARD_KEY,
  useBoard,
  type UseBoardActions,
  type UseBoardOptions,
  type UseBoardReturn,
  type UseBoardStorage
} from './use-board.js';
