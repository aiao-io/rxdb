# rxdb-plugin-board

## Classes

| Class | Description |
| ------ | ------ |
| [Board](classes/Board.md) | `Board` — the board itself: title required, description optional; columns and board-level labels are attached to the board (US-534 / US-536). |
| [BoardColumnSortService](classes/BoardColumnSortService.md) | Column sorting (US-535): one-time reorder via the column menu "Sort by due date" / "Sort by title". |
| [BoardDeleteService](classes/BoardDeleteService.md) | Delete service: plans outside the transaction, re-verifies the sets inside the transaction after confirmation, then deletes children before parents (see file header). |
| [BoardDetailService](classes/BoardDetailService.md) | Detail editing service: open snapshot, one-shot save and save-as-you-edit (see file header). |
| [BoardDomain](classes/BoardDomain.md) | Board domain service (US-534): entry points for creating boards / columns / tasks and renaming. |
| [BoardDomainError](classes/BoardDomainError.md) | Board domain error: stable error codes + readable messages. |
| [BoardLabel](classes/BoardLabel.md) | `BoardLabel` — board-level label definition: a name unique within the board + a color; tasks reference them many-to-many (US-536). |
| [BoardLabelService](classes/BoardLabelService.md) | Board label service: create / rename / recolor and deletion that "confirms outside the transaction, re-verifies inside" (see file header). |
| [BoardMoveService](classes/BoardMoveService.md) | Move service (US-535): cross-column moves / reordering within a column / dragging columns. |
| [BoardSearchSource](classes/BoardSearchSource.md) | Board-level search source: conforms to [SearchSourceLike](../rxdb-plugin-search/interfaces/SearchSourceLike.md); all three framework bindings consume the same implementation. The upstream full-text source is injected by the host (plugin instance); when it is not installed or the adapter does not support it, the host disables the entry (US-538 AC#5); this class performs no capability pre-check before `search()`. |
| [BoardShellController](classes/BoardShellController.md) | Board host shell orchestration (host half of the US-537 state flow). |
| [BoardWriteNotifier](classes/BoardWriteNotifier.md) | Write event notifier: the three framework bindings and tests subscribe to the same event stream. |
| [Column](classes/Column.md) | `Column` — a board column: an ordering domain grouped by `boardId` (drag columns within the board). |
| [Task](classes/Task.md) | `Task` — a board task: an ordering domain grouped by `columnId` (manual ordering within a column). |
| [TaskLabel](classes/TaskLabel.md) | `TaskLabel` — many-to-many join table between tasks and board-level labels (US-536). |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [BoardBackupAdapter](interfaces/BoardBackupAdapter.md) | Local adapter that supports backup / restore (subset of the public US-217 methods; all sqlite-family adapters have them). |
| [BoardDeletePlan](interfaces/BoardDeletePlan.md) | Board deletion plan. |
| [BoardFilter](interfaces/BoardFilter.md) | Parsed filter: all conditions ANDed. |
| [BoardFilterContext](interfaces/BoardFilterContext.md) | Completion context: labels and columns of the current board. |
| [BoardFilterSuggestion](interfaces/BoardFilterSuggestion.md) | Completion item: `query` is the complete query string after selection. |
| [BoardFilterTarget](interfaces/BoardFilterTarget.md) | The filtered task view (assembled by the three frameworks from board / column / label data). |
| [BoardFilterTerm](interfaces/BoardFilterTerm.md) | Field condition: multiple values within the same token are ORed. |
| [BoardFilterText](interfaces/BoardFilterText.md) | Keyword condition. |
| [BoardGridColumn](interfaces/BoardGridColumn.md) | A grid navigation column: the visible card sequence (post-filter order). |
| [BoardHostContext](interfaces/BoardHostContext.md) | Board host context ("restoring" in the US-534 tech notes is the shared write gate). |
| [BoardKeyboardColumn](interfaces/BoardKeyboardColumn.md) | A column for keyboard moves: complete task sequence + visible sequence (filtered-out cards appear only in the complete sequence). |
| [BoardReadSnapshot](interfaces/BoardReadSnapshot.md) | A complete read snapshot of one board; relations and tasks come from the same query round. |
| [BoardSearchSourceOptions](interfaces/BoardSearchSourceOptions.md) | Optional parameters of the board search source (debounce, in-board page size, change-requery merge window). |
| [BoardSearchUpstream](interfaces/BoardSearchUpstream.md) | Upstream full-text source: a single-collection query that returns all hits (plugin instance or test double). |
| [BoardShellConfirm](interfaces/BoardShellConfirm.md) | A shell operation awaiting user confirmation (in-app confirmation dialog, not the native browser prompt). |
| [BoardShellOptions](interfaces/BoardShellOptions.md) | Host configuration for [BoardShellController](classes/BoardShellController.md). |
| [BoardShellRuntime](interfaces/BoardShellRuntime.md) | Browser capabilities the shell depends on; defaults to [browserBoardShellRuntime](functions/browserBoardShellRuntime.md), tests inject an in-memory implementation. |
| [BoardShellState](interfaces/BoardShellState.md) | Shell state snapshot: the shell component renders only this. |
| [BoardStorage](interfaces/BoardStorage.md) | Key-value storage interface (host-injected: browser `localStorage` / in-memory table in tests). |
| [CardDropColumnView](interfaces/CardDropColumnView.md) | Column view: container rectangle + visible card rectangles + complete task sequence (including rows that are filtered out or outside the render window). |
| [ColumnDeletePlan](interfaces/ColumnDeletePlan.md) | Column deletion plan. |
| [ColumnDropView](interfaces/ColumnDropView.md) | View for horizontal column-header drag: column header rectangles + complete column order within the board. |
| [ColumnSortResult](interfaces/ColumnSortResult.md) | Column sort result: whether anything was actually written (zero writes when already in the target order). |
| [LabelDeletePlan](interfaces/LabelDeletePlan.md) | Label deletion plan (read outside the transaction for confirmation). |
| [MenuMoveColumnView](interfaces/MenuMoveColumnView.md) | Column view for menu-based moves: complete task sequence, no geometry needed. |
| [PopoverAnchor](interfaces/PopoverAnchor.md) | Trigger rectangle (viewport coordinates). |
| [PopoverOptions](interfaces/PopoverOptions.md) | Placement options: `end` aligns right with the trigger (default), `start` aligns left. |
| [RestoreSnapshot](interfaces/RestoreSnapshot.md) | State machine snapshot: state + this restore's target and the destination on failure. |
| [SearchHandle](interfaces/SearchHandle.md) | Reactive handle returned by `collection.search()` / `rxDB.search()`. |
| [SearchResult](interfaces/SearchResult.md) | A single search hit. |
| [TaskDeletePlan](interfaces/TaskDeletePlan.md) | Task deletion plan. |
| [TaskDraft](interfaces/TaskDraft.md) | Detail draft: only the in-memory state is edited after opening. |
| [TaskDraftSnapshot](interfaces/TaskDraftSnapshot.md) | Snapshot taken when the detail view opens: compared against at save time. |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [BoardErrorCode](type-aliases/BoardErrorCode.md) | Domain error codes. |
| [BoardFilterField](type-aliases/BoardFilterField.md) | Filterable fields. |
| [BoardGridDirection](type-aliases/BoardGridDirection.md) | Focus movement direction: up/down within the same column, left/right across columns, first/last (Home / End). |
| [BoardMoveDirection](type-aliases/BoardMoveDirection.md) | Card move direction (Alt + arrow keys). |
| [BoardReadState](type-aliases/BoardReadState.md) | The snapshot is published only after all sub-collections are ready; failures stay distinguishable. |
| [BoardSearchUnavailableReason](type-aliases/BoardSearchUnavailableReason.md) | Stable reasons why the search entry is unavailable. |
| [BoardShellPhase](type-aliases/BoardShellPhase.md) | Shell phase: startup selection / preparing or connecting / restoring (including read-back after reload) / board. |
| [BoardWriteEvent](type-aliases/BoardWriteEvent.md) | Write state machine events: the persisted result of a move or column sort (committed on success / reason on failure). |
| [CardDropTarget](type-aliases/CardDropTarget.md) | Card drop target: between two neighbors (first position `prevId=null`, last position `nextId=null`) or append to an empty column. |
| [ColumnSortMode](type-aliases/ColumnSortMode.md) | Column sort mode (US-535 AC#4 / #10). |
| [DeletePlan](type-aliases/DeletePlan.md) | Deletion plan: task / column / board, distinguished by `kind`. |
| [DueStatus](type-aliases/DueStatus.md) | Due status: overdue / due today / not due. |
| [RestoreInput](type-aliases/RestoreInput.md) | State machine input (the host translates user actions and execution results into inputs). |
| [RestoreState](type-aliases/RestoreState.md) | Restore state. |
| [SaveTaskDraftResult](type-aliases/SaveTaskDraftResult.md) | Save result: written (with the re-queried task) or zero writes because the content did not change. |
| [TaskFieldPatch](type-aliases/TaskFieldPatch.md) | Field patch for save-as-you-edit (board v2 detail sidebar): lists only the fields changed this time. |

## Variables

| Variable | Description |
| ------ | ------ |
| [ACTIVE\_DB\_KEY](variables/ACTIVE_DB_KEY.md) | Active database name record key (localStorage): the currently opened board database; no record = first launch (show the startup selection page). |
| [BOARD\_LABEL\_COLORS](variables/BOARD_LABEL_COLORS.md) | 8 preset colors (the names serve accessibility names and hints). |
| [BOARD\_RESTORE\_LOCK](variables/BOARD_RESTORE_LOCK.md) | Cross-page lock name shared by restore, startup read-back and residue cleanup. |
| [DEFAULT\_BOARD\_SEARCH\_PAGE\_SIZE](variables/DEFAULT_BOARD_SEARCH_PAGE_SIZE.md) | Default in-board page size: the acceptance basis for search pagination when both the isolated board and the main board exceed one page of hits. |
| [DIALOG\_FOCUSABLE\_SELECTOR](variables/DIALOG_FOCUSABLE_SELECTOR.md) | Elements inside a dialog that participate in the Tab cycle: enabled controls, links and explicitly focusable elements. |
| [initialRestoreSnapshot](variables/initialRestoreSnapshot.md) | Initial snapshot: startup selection, no restore target, no marker. |
| [PENDING\_SWITCH\_KEY](variables/PENDING_SWITCH_KEY.md) | Pending switch database name record key (localStorage): after restore completes, the whole page reloads and only a successful read-back turns it into the active position. |
| [RESTORE\_TARGET\_KEY](variables/RESTORE_TARGET_KEY.md) | Record key (localStorage) for this restore's target database name: reopening after an interruption cleans only this one storage; when cleanup fails it stays for the next retry. |
| [RESTORING\_MARKER\_KEY](variables/RESTORING_MARKER_KEY.md) | Restoring marker key (localStorage): the signal source for the cross-page write gate (US-539 AC#5). |

## Functions

| Function | Description |
| ------ | ------ |
| [assertBoardWritable](functions/assertBoardWritable.md) | Write gate while restoring: all application write entries (create / edit / delete / move / column sort / undo redo / restore again) pass through this first at the domain service layer (US-534 AC#10). |
| [browserBoardShellRuntime](functions/browserBoardShellRuntime.md) | Browser capabilities: `localStorage`, Web Locks, IndexedDB database name list, `storage` events and full page reload. |
| [clearPendingSwitch](functions/clearPendingSwitch.md) | Clears the pending switch record after a successful read-back is written as the active position, or after a failed read-back cleans up the target. |
| [clearRestoringMarker](functions/clearRestoringMarker.md) | Clears the restoring marker after restore finishes (successful switch or failed cleanup), re-enabling writes on every page. |
| [describeBoardFailure](functions/describeBoardFailure.md) | Reduces any error to a displayable reason: stable error codes first (`reason` / `code`), never parses message text. |
| [dropIndicatorAnchor](functions/dropIndicatorAnchor.md) | Visible anchor for drop feedback: the insertion line is drawn after the visible previous neighbor; when that neighbor is filtered out, it is drawn before the visible next neighbor; when neither side is visible or appending to an empty column, returns `null` (the caller falls back to highlighting the whole column). |
| [dueStatus](functions/dueStatus.md) | Due date status relative to local today; returns `null` when there is no due date. |
| [dueStatusText](functions/dueStatusText.md) | Due date text: overdue / today use words, color is only auxiliary (US-539 interaction convention "card" row). |
| [eq](functions/eq.md) | `field = value` rule (generics narrow the field and value types). Values only accept strings: the fields filtered by column on boards are all UUID / text; relax this when callers query numeric, boolean or date columns. |
| [focusModalTab](functions/focusModalTab.md) | Confines Tab within the modal; an empty modal focuses the container, middle positions keep the browser order. |
| [inRule](functions/inRule.md) | `field IN [...]` rule. |
| [isBoardFilterEmpty](functions/isBoardFilterEmpty.md) | Whether the filter has no conditions. |
| [isHexColor](functions/isHexColor.md) | Whether it is a valid label color format (#rgb / #rrggbb). |
| [isValidDueDate](functions/isValidDueDate.md) | `YYYY-MM-DD` and a valid Gregorian date (2024-02-29 valid, 2026-02-29 / 2026-13-01 invalid). Pure arithmetic implementation: dates are not parsed into UTC instants, so there is no drift across timezones (US-536 AC#13). |
| [labelTextColor](functions/labelTextColor.md) | Chooses the text color (black or white) based on the label background color. |
| [localDateKey](functions/localDateKey.md) | Local date key `YYYY-MM-DD` (takes local year/month/day, not via UTC). |
| [matchAll](functions/matchAll.md) | Empty rule group that matches all rows. |
| [matchesBoardFilter](functions/matchesBoardFilter.md) | Whether a task matches the filter (all conditions ANDed). |
| [msUntilNextLocalMidnight](functions/msUntilNextLocalMidnight.md) | Milliseconds until the next local midnight, at least 1 second (for recomputing derived state across midnight). |
| [nextGridFocus](functions/nextGridFocus.md) | Focus movement target: up/down moves within the same column and stops at the edges; left/right jumps to the same row of the nearest non-empty column (short columns take the last card). |
| [nextLabelColor](functions/nextLabelColor.md) | Default color for a new label: the first preset color not used by the current board; cycles from the start after all are used. Compares in lowercase and does not expand the `#rgb` short format: none of the 8 preset colors has a 3-digit form, so custom short-format colors cannot collide with presets; two forms of the same color only count one extra "used" after all presets are used, shifting the cycle start. |
| [nextRestoreDbName](functions/nextRestoreDbName.md) | Generates a new database name that does not conflict with the active position. |
| [normalizeBoardTitle](functions/normalizeBoardTitle.md) | Valid title after trimming surrounding whitespace; returns `null` for an empty or all-whitespace string. |
| [observeBoardRead](functions/observeBoardRead.md) | Observes all sub-collections of the current board; unsubscribing also cancels all in-flight sub-queries. |
| [parseBoardFilter](functions/parseBoardFilter.md) | Parses the filter query string. Incomplete field tokens (e.g. `label:`) produce no condition. |
| [placePopover](functions/placePopover.md) | Top-left corner coordinates of the popover: below the trigger by default; flips above when there is no room below and the top has more space; horizontally and vertically finally clamped back into the viewport. |
| [readActiveDbName](functions/readActiveDbName.md) | Current active database name; no record = first launch (show the startup selection page). |
| [readFirst](functions/readFirst.md) | Reads the first snapshot of a query and returns an array copy (shared by facade live queries and executor repository queries). |
| [readPendingSwitch](functions/readPendingSwitch.md) | Pending switch database name; no record = no restore awaiting read-back. |
| [readRestoringMarker](functions/readRestoringMarker.md) | Whether any page is restoring (writes pause while the marker exists). |
| [requireBoardId](functions/requireBoardId.md) | Gets the current board id: throws `board_not_found` when there is no board. |
| [resolveCardDrop](functions/resolveCardDrop.md) | Pointer coordinates → column head / between two neighbors / column tail / empty column; a drop at the original position returns `null` (the caller does not start a reorder). |
| [resolveColumnDrop](functions/resolveColumnDrop.md) | Horizontal column-header drag → the two neighbors; returns `null` in place. Column order is computed from the complete sequence within the board. |
| [resolveKeyboardMove](functions/resolveKeyboardMove.md) | Alt + arrow key move target: up/down skips adjacent visible cards in the same column, left/right moves to the same row of the adjacent column (an adjacent empty column appends directly). |
| [resolveMenuMove](functions/resolveMenuMove.md) | Menu-based move target (US-539 AC#6 keyboard-equivalent path): insertion index within the target column → between target. |
| [restoreStateMachine](functions/restoreStateMachine.md) | Pure function state machine: `(snapshot, input) → new snapshot`. |
| [suggestBoardFilter](functions/suggestBoardFilter.md) | Input completion: the cursor is treated as being at the end of the query. Completes fields when the end is whitespace or a field name is being typed; completes values after a field name (multi-value tokens complete only the last segment), and appends a space after a value is selected. |
| [toggleBoardFilterValue](functions/toggleBoardFilterValue.md) | Click-to-filter: removes the value if it already exists in the query (in a non-negated token), otherwise appends a `field:value` token. |
| [trapTabFocus](functions/trapTabFocus.md) | Tab focus cycle target. |
| [whereEq](functions/whereEq.md) | `field = value` rule group. |
| [writeActiveDbName](functions/writeActiveDbName.md) | Writes the new database as the active position only after read-back succeeds (US-537: an interruption before the switch commits still returns to the old position). |
| [writePendingSwitch](functions/writePendingSwitch.md) | Restore complete → writes the pending switch record and reloads the whole page. |
| [writeRestoringMarker](functions/writeRestoringMarker.md) | Restoring marker: all pages pause writes based on it (state source of the US-534 restoring write gate). |
