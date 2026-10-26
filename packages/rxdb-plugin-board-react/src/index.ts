/**
 * rxdb-plugin-board-react - React 集成层
 *
 * 提供 `useBoard()`：看板领域数据 state + 领域动作集合。
 * 命名与 Angular / Vue 绑定层一致。
 *
 * @packageDocumentation
 */

export { BoardDomainError, resolveCardDrop, resolveColumnDrop } from '@aiao/rxdb-plugin-board';
export type {
  Board,
  BoardHostContext,
  BoardLabel,
  BoardWriteEvent,
  BoardSearchUnavailableReason,
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
export { BoardView, type BoardViewProps } from './board-view.js';
export {
  LAST_BOARD_KEY,
  useBoard,
  type UseBoardActions,
  type UseBoardOptions,
  type UseBoardReturn,
  type UseBoardStorage
} from './use-board.js';
