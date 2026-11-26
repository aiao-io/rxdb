# React board

`BoardView` consumes a connected board RxDB instance. The application entry also loads the published package styles:

```ts
import { BoardView } from '@aiao/rxdb-plugin-board-react';
import '@aiao/rxdb-plugin-board-react/board-view.css';
```

The styles include column layout, the detail panel, and drop-target feedback, with the same name as the `board-view.css` subpath of the Angular / Vue bindings. `useBoard` provides domain data and actions, and the view styles do not need to be loaded when it is used standalone.

When startup selection and backup restore are needed, use the shell `BoardShell` instead: it follows the orchestration of the core package's `BoardShellController` to first show "New empty board / Load demo data / Restore from backup" (no connection before a choice is made), and the board phase offers "Reset to demo data / Restore from backup"; after restoring to a new database name the whole page reloads and only switches once the read-back succeeds. The host only provides an instance factory and optional demo data, and `options` takes a stable reference:

```tsx
import { BoardShell } from '@aiao/rxdb-plugin-board-react';
import type { BoardShellOptions } from '@aiao/rxdb-plugin-board';

const shellOptions: BoardShellOptions = { createRxdb, adapterName: 'sqlite-wasm', seed: seedReleaseBoardDataset };

export const BoardPage = () => <BoardShell options={shellOptions} />;
```

rxdb-plugin-board-react - React integration layer

Provides `useBoard()`: board domain data state + a set of domain actions;
`BoardView` is the board view, and `BoardShell` is the shell with startup selection and backup restore.
Naming matches the Angular / Vue binding layers.

## Classes

| Class                                           | Description                                               |
| ----------------------------------------------- | --------------------------------------------------------- |
| [BoardDomainError](classes/BoardDomainError.md) | Board domain error: stable error code + readable message. |

## Interfaces

| Interface                                            | Description                                                                                                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Board](interfaces/Board.md)                         | `Board` — the board of the board: title required, description optional; columns and board-level labels are attached to the board (US-534 / US-536).         |
| [BoardHostContext](interfaces/BoardHostContext.md)   | Board host context ("restoring" in the US-534 tech note is the shared write gate).                                                                          |
| [BoardLabel](interfaces/BoardLabel.md)               | `BoardLabel` — board-level label definition: a board-unique name + color, referenced many-to-many by tasks (US-536).                                        |
| [BoardShellOptions](interfaces/BoardShellOptions.md) | Host configuration of [BoardShellController](../rxdb-plugin-board/classes/BoardShellController.md).                                                         |
| [BoardShellProps](interfaces/BoardShellProps.md)     | Props of [BoardShell](functions/BoardShell.md).                                                                                                             |
| [BoardViewProps](interfaces/BoardViewProps.md)       | Props of [BoardView](functions/BoardView.md).                                                                                                               |
| [Column](interfaces/Column.md)                       | `Column` — a column of the board: an ordering domain grouped by `boardId` (drag columns within the board).                                                  |
| [LabelDeletePlan](interfaces/LabelDeletePlan.md)     | Label deletion plan (confirmation read outside the transaction).                                                                                            |
| [Task](interfaces/Task.md)                           | `Task` — a board task: an ordering domain grouped by `columnId` (manual ordering within a column).                                                          |
| [TaskDraft](interfaces/TaskDraft.md)                 | Detail draft: after opening, only the in-memory state is edited.                                                                                            |
| [TaskDraftSnapshot](interfaces/TaskDraftSnapshot.md) | Snapshot when the detail is opened: cross-checked on save.                                                                                                  |
| [UseBoardActions](interfaces/UseBoardActions.md)     | Board domain actions: each delegates to the core package domain services; the write gate during restore and validation are re-checked in the service layer. |
| [UseBoardOptions](interfaces/UseBoardOptions.md)     | Optional parameters of [useBoard](functions/useBoard.md).                                                                                                   |
| [UseBoardReturn](interfaces/UseBoardReturn.md)       | Return value of [useBoard](functions/useBoard.md): board state (React state) and domain actions.                                                            |
| [UseBoardStorage](interfaces/UseBoardStorage.md)     | Local record storage: remembers the last opened board (localStorage by default, in-memory table injected in tests).                                         |

## Type Aliases

| Type Alias                                                                   | Description                                                                                                             |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [BoardSearchUnavailableReason](type-aliases/BoardSearchUnavailableReason.md) | Stable reason why the search entry is unavailable.                                                                      |
| [BoardWriteEvent](type-aliases/BoardWriteEvent.md)                           | Write state machine events: persistence results of moves and column ordering (success committed / failure with reason). |
| [CardDropTarget](type-aliases/CardDropTarget.md)                             | Card drop target: between two neighbors (head `prevId=null`, tail `nextId=null`) or append to an empty column.          |
| [ColumnSortMode](type-aliases/ColumnSortMode.md)                             | Ordering mode of the column (US-535 AC#4 / #10).                                                                        |
| [DeletePlan](type-aliases/DeletePlan.md)                                     | Deletion plan: task / column / board, distinguished by `kind`.                                                          |
| [SaveTaskDraftResult](type-aliases/SaveTaskDraftResult.md)                   | Save result: written (with the re-queried task) or zero-write because the content is unchanged.                         |

## Variables

| Variable                                            | Description                                                                                                                                                    |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [LAST\_BOARD\_KEY](variables/LAST_BOARD_KEY.md)     | Local record key of the last opened board.                                                                                                                     |
| [resolveCardDrop](variables/resolveCardDrop.md)     | Pointer coordinates → column head / between two neighbors / column tail / empty column; an in-place drop returns `null` (the caller does not start a reorder). |
| [resolveColumnDrop](variables/resolveColumnDrop.md) | Horizontal drag of a column header → the two adjacent neighbors; in-place returns `null`. Column order is converted from the complete in-board sequence.       |

## Functions

| Function                              | Description                                                                                                                                                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [BoardShell](functions/BoardShell.md) | Board shell (US-537 / US-539 AC#4 / #5): startup selection (new empty board / load demo data / restore from backup), preparing and restoring, toolbar (reset to demo data / restore from backup) and in-app confirmation, embedding [BoardView](functions/BoardView.md) in the board phase. |
| [BoardView](functions/BoardView.md)   | Board view component (board v2, GitHub Projects style): header + filter bar + columns / cards + overlay detail sidebar + root-level menu / picker + modal dialogs + action notices with undo.                                                                                               |
| [useBoard](functions/useBoard.md)     | Board domain bridge: React state + action set. All subscriptions are released automatically on unmount.                                                                                                                                                                                     |
