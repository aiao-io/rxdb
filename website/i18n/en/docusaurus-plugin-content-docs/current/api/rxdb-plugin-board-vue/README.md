# Vue board

`BoardView` consumes a connected board RxDB instance. The application entry also loads the published package's styles:

```ts
import { BoardView } from '@aiao/rxdb-plugin-board-vue';
import '@aiao/rxdb-plugin-board-vue/board-view.css';
```

The styles include the column layout, the detail panel and drag-and-drop target feedback, under the same `board-view.css` subpath as the React / Angular bindings. `useBoard` provides the domain data and actions; the view styles are not needed when it is used standalone.

Use the shell `BoardShell` when startup selection and backup restore are needed: following the core package `BoardShellController`'s orchestration, it first shows "create an empty board / load demo data / restore from backup" (no connection before selection), and in the board phase provides "reset to demo data / restore from backup"; after restoring to a new database name it reloads the whole page and only switches after reading back successfully. The host only provides an instance factory and optional demo data (read once on mount):

```vue
<script lang="ts" setup>
import { BoardShell } from '@aiao/rxdb-plugin-board-vue';
import type { BoardShellOptions } from '@aiao/rxdb-plugin-board';

const shellOptions: BoardShellOptions = { createRxdb, adapterName: 'sqlite-wasm', seed: seedReleaseBoardDataset };
</script>

<template>
  <BoardShell :options="shellOptions" />
</template>
```

rxdb-plugin-board-vue - Vue integration layer

Provides `useBoard()`: board domain data refs + a set of domain actions;
`BoardView` is the board view, `BoardShell` is the shell with startup selection and backup restore.
Naming matches the Angular / React binding layers.

## Classes

| Class                                           | Description                                                   |
| ----------------------------------------------- | ------------------------------------------------------------- |
| [BoardDomainError](classes/BoardDomainError.md) | Board domain error: a stable error code + a readable message. |

## Interfaces

| Interface                                            | Description                                                                                                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Board](interfaces/Board.md)                         | `Board` — a board: title required, description optional; columns and board-level labels are all attached to the board (US-534 / US-536).                 |
| [BoardHostContext](interfaces/BoardHostContext.md)   | Board host context (per US-534 technical note, "restoring" is the shared write gate).                                                                    |
| [BoardLabel](interfaces/BoardLabel.md)               | `BoardLabel` — board-level label definition: a name unique within the board plus a color; tasks reference labels many-to-many (US-536).                  |
| [BoardShellOptions](interfaces/BoardShellOptions.md) | Host configuration of [BoardShellController](../rxdb-plugin-board/classes/BoardShellController.md).                                                      |
| [Column](interfaces/Column.md)                       | `Column` — a column of the board: a sortable domain grouped by `boardId` (columns are dragged within the board).                                         |
| [LabelDeletePlan](interfaces/LabelDeletePlan.md)     | Label deletion plan (confirmation is read outside the transaction).                                                                                      |
| [Task](interfaces/Task.md)                           | `Task` — a board task: a sortable domain grouped by `columnId` (manually ordered within a column).                                                       |
| [TaskDraft](interfaces/TaskDraft.md)                 | Detail draft: after opening, only the in-memory state is edited.                                                                                         |
| [TaskDraftSnapshot](interfaces/TaskDraftSnapshot.md) | Snapshot taken when the detail opens: compared against it when saving.                                                                                   |
| [UseBoardActions](interfaces/UseBoardActions.md)     | Board domain actions: each delegates to a core package domain service; the write gate during restore and validation are re-checked in the service layer. |
| [UseBoardOptions](interfaces/UseBoardOptions.md)     | Optional parameters of [useBoard](functions/useBoard.md).                                                                                                |
| [UseBoardReturn](interfaces/UseBoardReturn.md)       | Return value of [useBoard](functions/useBoard.md): board state (read-only refs) and domain actions.                                                      |
| [UseBoardStorage](interfaces/UseBoardStorage.md)     | Local storage: remembers the last opened board (defaults to localStorage; tests inject an in-memory table).                                              |

## Type Aliases

| Type Alias                                                                   | Description                                                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [BoardSearchUnavailableReason](type-aliases/BoardSearchUnavailableReason.md) | Stable reason when the search entry is unavailable.                                                                             |
| [BoardWriteEvent](type-aliases/BoardWriteEvent.md)                           | Write state machine events: the persisted outcome of moves and in-column sorting (committed on success / failed with a reason). |
| [CardDropTarget](type-aliases/CardDropTarget.md)                             | Card drop target: between two neighbors (head with `prevId=null`, tail with `nextId=null`) or append to an empty column.        |
| [ColumnSortMode](type-aliases/ColumnSortMode.md)                             | Sort mode of this column (US-535 AC#4 / #10).                                                                                   |
| [DeletePlan](type-aliases/DeletePlan.md)                                     | Deletion plan: task / column / board, distinguished by `kind`.                                                                  |
| [SaveTaskDraftResult](type-aliases/SaveTaskDraftResult.md)                   | Save result: written (with the re-fetched task) or unchanged with a zero-write.                                                 |

## Variables

| Variable                                            | Description                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [BoardShell](variables/BoardShell.md)               | -                                                                                                                                                                               |
| [LAST\_BOARD\_KEY](variables/LAST_BOARD_KEY.md)     | Local storage key of the last opened board.                                                                                                                                     |
| [resolveCardDrop](variables/resolveCardDrop.md)     | Pointer coordinates → column start / between two neighbors / column end / empty column; returns `null` for an in-place drop (the caller does not start a reorder).              |
| [resolveColumnDrop](variables/resolveColumnDrop.md) | Column header dragged horizontally → the two neighbors before/after; returns `null` for an in-place drop. Column order is computed from the complete sequence within the board. |

## Functions

| Function                          | Description                                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [useBoard](functions/useBoard.md) | Board domain bridge: Vue refs + action set. Subscriptions are cleaned up automatically when the component unmounts (or the scope is released). |

## References

### BoardView \{#boardview\}

Renames and re-exports [BoardShell](variables/BoardShell.md)
