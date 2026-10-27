export type { SearchHandle, SearchResult } from '@aiao/rxdb-plugin-search';
export { BoardDomain } from './board-domain.js';
export {
  ACTIVE_DB_KEY,
  PENDING_SWITCH_KEY,
  RESTORING_MARKER_KEY,
  clearPendingSwitch,
  clearRestoringMarker,
  nextRestoreDbName,
  readActiveDbName,
  readPendingSwitch,
  readRestoringMarker,
  writeActiveDbName,
  writePendingSwitch,
  writeRestoringMarker,
  type BoardStorage
} from './board-storage.js';
export { BoardColumnSortService, type ColumnSortMode, type ColumnSortResult } from './column-sort-service.js';
export {
  BoardDeleteService,
  type BoardDeletePlan,
  type ColumnDeletePlan,
  type DeletePlan,
  type TaskDeletePlan
} from './delete-service.js';
export {
  BoardDetailService,
  type SaveTaskDraftResult,
  type TaskDraft,
  type TaskDraftSnapshot,
  type TaskFieldPatch
} from './detail-service.js';
export {
  dropIndicatorAnchor,
  resolveCardDrop,
  resolveColumnDrop,
  resolveMenuMove,
  type CardDropColumnView,
  type CardDropTarget,
  type ColumnDropView,
  type MenuMoveColumnView
} from './drop-resolution.js';
export { dueStatus, dueStatusText, localDateKey, msUntilNextLocalMidnight, type DueStatus } from './due-status.js';
export { Board, BoardLabel, Column, Task, TaskLabel } from './entities/index.js';
export { BoardDomainError, type BoardErrorCode } from './errors.js';
export {
  isBoardFilterEmpty,
  matchesBoardFilter,
  parseBoardFilter,
  suggestBoardFilter,
  toggleBoardFilterValue,
  type BoardFilter,
  type BoardFilterContext,
  type BoardFilterField,
  type BoardFilterSuggestion,
  type BoardFilterTarget,
  type BoardFilterTerm,
  type BoardFilterText
} from './filter/board-filter.js';
export { assertBoardWritable, requireBoardId, type BoardHostContext } from './host-context.js';
export {
  nextGridFocus,
  resolveKeyboardMove,
  type BoardGridColumn,
  type BoardGridDirection,
  type BoardKeyboardColumn,
  type BoardMoveDirection
} from './keyboard.js';
export { BoardLabelService, type LabelDeletePlan } from './label-service.js';
export { isHexColor, labelTextColor } from './label-text-color.js';
export { BoardMoveService } from './move-service.js';
export { BOARD_LABEL_COLORS, nextLabelColor } from './palette.js';
export { placePopover, type PopoverAnchor, type PopoverOptions } from './popover.js';
export { eq, inRule, matchAll, readFirst, whereEq } from './query.js';
export {
  initialRestoreSnapshot,
  restoreStateMachine,
  type RestoreInput,
  type RestoreSnapshot,
  type RestoreState
} from './restore-machine.js';
export {
  BoardSearchSource,
  DEFAULT_BOARD_SEARCH_PAGE_SIZE,
  type BoardSearchSourceOptions,
  type BoardSearchUnavailableReason,
  type BoardSearchUpstream
} from './search/board-search-source.js';
export { isValidDueDate, normalizeBoardTitle } from './title.js';
export { BoardWriteNotifier, describeBoardFailure, type BoardWriteEvent } from './write-notifier.js';
