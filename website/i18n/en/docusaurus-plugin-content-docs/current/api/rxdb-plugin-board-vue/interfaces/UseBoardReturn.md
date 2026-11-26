# UseBoardReturn

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L74)

Return value of [useBoard](../functions/useBoard.md): board state (read-only refs) and domain actions.

## Properties

### actions \{#actions\}

```ts
readonly actions: UseBoardActions;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L112)

Domain actions (synchronously ready during setup, all passing through the core package services' write gate and validation).

***

### boards \{#boards\}

```ts
readonly boards: Ref<readonly Board[]>;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L80)

All boards (ascending by creation time, ties broken by id).

***

### columns \{#columns\}

```ts
readonly columns: Ref<readonly Column[]>;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L86)

Columns of the current board (in-board column order).

***

### currentBoard \{#currentboard\}

```ts
readonly currentBoard: Ref<Board | null>;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L84)

Current board; `null` when there is none.

***

### currentBoardId \{#currentboardid\}

```ts
readonly currentBoardId: Ref<`${string}-${string}-${string}-${string}-${string}` | null>;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L82)

Current board id (persisted in local storage).

***

### labels \{#labels\}

```ts
readonly labels: Ref<readonly BoardLabel[]>;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L90)

Board-level labels of the current board (ascending by creation time, ties broken by id).

***

### loading \{#loading\}

```ts
readonly loading: Ref<boolean>;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L96)

Initial read or retry in progress: `true` until both the board list and the current board data are ready; `false` once the read fails.

***

### readError \{#readerror\}

```ts
readonly readError: Ref<string | null>;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L98)

Read failure reason; `null` when reads are healthy.

***

### redoCount \{#redocount\}

```ts
readonly redoCount: Ref<number>;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L104)

Depth of the redo stack (used to disable the redo entry).

***

### restoring \{#restoring\}

```ts
readonly restoring: Ref<boolean>;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L94)

Write gate during restore (US-534 / US-537).

***

### retryReads \{#retryreads\}

```ts
readonly retryReads: () => void;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L100)

Clears the read failure and rebuilds all read subscriptions.

#### Returns

`void`

***

### searchSource \{#searchsource\}

```ts
readonly searchSource: 
  | BoardSearchSource
  | null;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L76)

Board-level search source (US-539 phase B); `null` when the host has not injected an upstream.

***

### searchUnavailableReason \{#searchunavailablereason\}

```ts
readonly searchUnavailableReason: 
  | BoardSearchUnavailableReason
  | null;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L78)

Stable reason when the search entry is unavailable.

***

### selectBoard \{#selectboard\}

```ts
readonly selectBoard: (boardId) => void;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L108)

Switch board: writes the local record and switches the data streams.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `boardId` | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

`void`

***

### setRestoring \{#setrestoring\}

```ts
readonly setRestoring: (value) => void;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L110)

Enter / leave the restoring state (restore orchestration is driven by the host; this binding only holds the state).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `boolean` |

#### Returns

`void`

***

### taskLabels \{#tasklabels\}

```ts
readonly taskLabels: Ref<ReadonlyMap<string, readonly BoardLabel[]>>;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L92)

Task → its labels (in label creation order).

***

### tasks \{#tasks\}

```ts
readonly tasks: Ref<readonly Task[]>;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L88)

All tasks of the current board (store order within each column).

***

### undoCount \{#undocount\}

```ts
readonly undoCount: Ref<number>;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L102)

Number of undoable transactions in this session (used to disable the undo entry).

***

### writeEvent \{#writeevent\}

```ts
readonly writeEvent: Ref<
  | {
  kind: string;
  reason?: string;
}
  | null>;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L106)

Most recent move / sort write event (success or failure).
