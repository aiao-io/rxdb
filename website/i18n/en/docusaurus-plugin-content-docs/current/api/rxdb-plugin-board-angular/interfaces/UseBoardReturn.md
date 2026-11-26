# UseBoardReturn

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L78)

Return value of [useBoard](../functions/useBoard.md): board state (signals) and domain actions.

## Properties

### actions \{#actions\}

```ts
readonly actions: UseBoardActions;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L116)

Domain actions (all go through the core package services' write gate and validation).

---

### boards \{#boards\}

```ts
readonly boards: Signal<readonly Board[]>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L84)

All boards (creation time ascending, by id at the same time).

---

### columns \{#columns\}

```ts
readonly columns: Signal<readonly Column[]>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L90)

Columns of the current board (in-board column order).

---

### currentBoard \{#currentboard\}

```ts
readonly currentBoard: Signal<Board | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L88)

Current board; `null` when there is none.

---

### currentBoardId \{#currentboardid\}

```ts
readonly currentBoardId: Signal<`${string}-${string}-${string}-${string}-${string}` | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L86)

Current board id (persisted to the local record).

---

### labels \{#labels\}

```ts
readonly labels: Signal<readonly BoardLabel[]>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L94)

Board-level labels of the current board (creation time ascending, by id at the same time).

---

### loading \{#loading\}

```ts
readonly loading: Signal<boolean>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L100)

First read or retry in progress: `true` until both the board list and the current board data are ready, `false` once the read fails.

---

### readError \{#readerror\}

```ts
readonly readError: Signal<string | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L102)

Reason the read failed; `null` when reads are healthy.

---

### redoCount \{#redocount\}

```ts
readonly redoCount: Signal<number>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L108)

Redo stack depth (disable criterion of the redo entry).

---

### restoring \{#restoring\}

```ts
readonly restoring: Signal<boolean>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L98)

Write gate during restore (US-534 / US-537).

---

### retryReads \{#retryreads\}

```ts
readonly retryReads: () => void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L104)

Clears the read failure and rebuilds all read subscriptions.

#### Returns

`void`

---

### searchSource \{#searchsource\}

```ts
readonly searchSource:
  | BoardSearchSource
  | null;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L80)

Board-level search source (US-539 phase B); `null` when the host did not inject an upstream.

---

### searchUnavailableReason \{#searchunavailablereason\}

```ts
readonly searchUnavailableReason:
  | BoardSearchUnavailableReason
  | null;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L82)

Stable reason when the search entry is unavailable.

---

### selectBoard \{#selectboard\}

```ts
readonly selectBoard: (boardId) => void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L112)

Switches boards: writes the local record and switches the data streams.

#### Parameters

| Parameter | Type                                                      |
| --------- | --------------------------------------------------------- |
| `boardId` | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

`void`

---

### setRestoring \{#setrestoring\}

```ts
readonly setRestoring: (value) => void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:114](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L114)

Enters / exits restoring (the restore orchestration is driven by the host; this binding only holds the state).

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `value`   | `boolean` |

#### Returns

`void`

---

### taskLabels \{#tasklabels\}

```ts
readonly taskLabels: Signal<ReadonlyMap<string, readonly BoardLabel[]>>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L96)

Task → its labels (in label creation order).

---

### tasks \{#tasks\}

```ts
readonly tasks: Signal<readonly Task[]>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L92)

All tasks of the current board (database order per column).

---

### undoCount \{#undocount\}

```ts
readonly undoCount: Signal<number>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L106)

Number of undoable transactions in this session (disable criterion of the undo entry).

---

### writeEvent \{#writeevent\}

```ts
readonly writeEvent: Signal<
  | {
  kind: string;
  reason?: string;
}
  | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L110)

Most recent move / ordering write event (success or failure).
