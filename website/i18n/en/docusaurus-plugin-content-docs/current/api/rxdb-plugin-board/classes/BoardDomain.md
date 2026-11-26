# BoardDomain

Defined in: [packages/rxdb-plugin-board/src/board-domain.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-domain.ts#L21)

Board domain service (US-534): entry points for creating boards / columns / tasks and renaming.

## Remarks

Creation always goes through facade repositories (auto-appending `sortOrder` per group, passing the US-027 operation permission checks);
the structural ownership rules (`column.board_id` immutable after creation, tasks may only belong to the current board, the target column
of a new task must belong to the current board) are validated at this service's entries — direct SQL and adapter interfaces are trusted
maintenance entries where only foreign keys guard reference existence, and this service does not promise to reject ownership rewrites
there (US-534 tech notes).
Each instance is bound to one RxDB and one host context.

## Constructors

### Constructor

```ts
new BoardDomain(rxdb, ctx): BoardDomain;
```

Defined in: [packages/rxdb-plugin-board/src/board-domain.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-domain.ts#L22)

#### Parameters

| Parameter | Type                                                          |
| --------- | ------------------------------------------------------------- |
| `rxdb`    | [`RxDB`](../../rxdb/classes/RxDB.md)                          |
| `ctx`     | () => [`BoardHostContext`](../interfaces/BoardHostContext.md) |

#### Returns

`BoardDomain`

## Methods

### createBoard() \{#createboard\}

```ts
createBoard(input): Promise<Board>;
```

Defined in: [packages/rxdb-plugin-board/src/board-domain.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-domain.ts#L28)

Creates a board: title required after trimming surrounding whitespace, description optional.

#### Parameters

| Parameter            | Type                                               |
| -------------------- | -------------------------------------------------- |
| `input`              | \{ `description?`: `string`; `title`: `string`; \} |
| `input.description?` | `string`                                           |
| `input.title`        | `string`                                           |

#### Returns

`Promise`&lt;[`Board`](Board.md)&gt;

---

### createColumn() \{#createcolumn\}

```ts
createColumn(input): Promise<Column>;
```

Defined in: [packages/rxdb-plugin-board/src/board-domain.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-domain.ts#L41)

Creates a column: the column belongs to the current board and is appended to the end of the in-board column order.

#### Parameters

| Parameter     | Type                     |
| ------------- | ------------------------ |
| `input`       | \{ `title`: `string`; \} |
| `input.title` | `string`                 |

#### Returns

`Promise`&lt;[`Column`](Column.md)&gt;

---

### createTask() \{#createtask\}

```ts
createTask(input): Promise<Task>;
```

Defined in: [packages/rxdb-plugin-board/src/board-domain.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-domain.ts#L51)

Creates a task: the target column must exist and belong to the current board; appends to the column tail.

#### Parameters

| Parameter        | Type                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `input`          | \{ `columnId`: `` `${string}-${string}-${string}-${string}-${string}` ``; `title`: `string`; \} |
| `input.columnId` | `` `${string}-${string}-${string}-${string}-${string}` ``                                       |
| `input.title`    | `string`                                                                                        |

#### Returns

`Promise`&lt;[`Task`](Task.md)&gt;

---

### listTasksOfBoard() \{#listtasksofboard\}

```ts
listTasksOfBoard(boardId): Promise<Task[]>;
```

Defined in: [packages/rxdb-plugin-board/src/board-domain.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-domain.ts#L123)

All tasks of the current board (no pagination).

#### Parameters

| Parameter | Type                                                      |
| --------- | --------------------------------------------------------- |
| `boardId` | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

`Promise`&lt;[`Task`](Task.md)[]&gt;

---

### requireBoard() \{#requireboard\}

```ts
requireBoard(boardId): Promise<Board>;
```

Defined in: [packages/rxdb-plugin-board/src/board-domain.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-domain.ts#L92)

Whether the current board exists.

#### Parameters

| Parameter | Type                                                      |
| --------- | --------------------------------------------------------- |
| `boardId` | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

`Promise`&lt;[`Board`](Board.md)&gt;

---

### requireColumnInBoard() \{#requirecolumninboard\}

```ts
requireColumnInBoard(columnId, boardId): Promise<Column>;
```

Defined in: [packages/rxdb-plugin-board/src/board-domain.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-domain.ts#L101)

The column exists and belongs to the given board (cross-board task ownership and cross-board moves are both rejected here).

#### Parameters

| Parameter  | Type                                                      |
| ---------- | --------------------------------------------------------- |
| `columnId` | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `boardId`  | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

`Promise`&lt;[`Column`](Column.md)&gt;

---

### requireTaskInBoard() \{#requiretaskinboard\}

```ts
requireTaskInBoard(taskId, boardId): Promise<Task>;
```

Defined in: [packages/rxdb-plugin-board/src/board-domain.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-domain.ts#L113)

The task exists and, by derivation through its owning column, belongs to the given board.

#### Parameters

| Parameter | Type                                                      |
| --------- | --------------------------------------------------------- |
| `taskId`  | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `boardId` | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

`Promise`&lt;[`Task`](Task.md)&gt;

---

### updateBoard() \{#updateboard\}

```ts
updateBoard(boardId, patch): Promise<Board>;
```

Defined in: [packages/rxdb-plugin-board/src/board-domain.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-domain.ts#L61)

Updates board title / description: writes only the given fields, accepts no ownership fields.

#### Parameters

| Parameter            | Type                                                      |
| -------------------- | --------------------------------------------------------- |
| `boardId`            | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `patch`              | \{ `description?`: `string`; `title?`: `string`; \}       |
| `patch.description?` | `string`                                                  |
| `patch.title?`       | `string`                                                  |

#### Returns

`Promise`&lt;[`Board`](Board.md)&gt;

---

### updateColumn() \{#updatecolumn\}

```ts
updateColumn(columnId, patch): Promise<Column>;
```

Defined in: [packages/rxdb-plugin-board/src/board-domain.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-domain.ts#L78)

Updates column title: writes only the title, provides no ownership fields (`column.board_id` is immutable after creation).

#### Parameters

| Parameter     | Type                                                      |
| ------------- | --------------------------------------------------------- |
| `columnId`    | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `patch`       | \{ `title`: `string`; \}                                  |
| `patch.title` | `string`                                                  |

#### Returns

`Promise`&lt;[`Column`](Column.md)&gt;

---

### updateTaskTitle() \{#updatetasktitle\}

```ts
updateTaskTitle(taskId, title): Promise<Task>;
```

Defined in: [packages/rxdb-plugin-board/src/board-domain.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-domain.ts#L85)

Shared by inline / detail: updates task title, writes only the title (US-536 inline editing commits only the title).

#### Parameters

| Parameter | Type                                                      |
| --------- | --------------------------------------------------------- |
| `taskId`  | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `title`   | `string`                                                  |

#### Returns

`Promise`&lt;[`Task`](Task.md)&gt;
