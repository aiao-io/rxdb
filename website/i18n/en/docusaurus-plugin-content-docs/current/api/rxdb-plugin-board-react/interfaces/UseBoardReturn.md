# UseBoardReturn

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L77)

Return value of [useBoard](../functions/useBoard.md): board state (React state) and domain actions.

## Properties

### actions \{#actions\}

```ts
readonly actions: UseBoardActions;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L115)

Domain actions (complete from the first frame; stable reference within the same `rxdb` instance).

---

### boards \{#boards\}

```ts
readonly boards: readonly Board[];
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L83)

All boards (ascending by creation time, ties broken by id).

---

### columns \{#columns\}

```ts
readonly columns: readonly Column[];
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L89)

Columns of the current board (in-board column order).

---

### currentBoard \{#currentboard\}

```ts
readonly currentBoard: Board | null;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L87)

Current board; `null` when there is none.

---

### currentBoardId \{#currentboardid\}

```ts
readonly currentBoardId: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L85)

Current board id (persisted in local storage).

---

### labels \{#labels\}

```ts
readonly labels: readonly BoardLabel[];
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L93)

Board-level labels of the current board (ascending by creation time, ties broken by id).

---

### loading \{#loading\}

```ts
readonly loading: boolean;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L99)

Initial read or retry in progress: `true` until both the board list and the current board data are ready; `false` once the read fails.

---

### readError \{#readerror\}

```ts
readonly readError: string | null;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L101)

Read failure reason; `null` when reads are healthy.

---

### redoCount \{#redocount\}

```ts
readonly redoCount: number;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L107)

Depth of the redo stack (used to disable the redo entry).

---

### restoring \{#restoring\}

```ts
readonly restoring: boolean;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L97)

Write gate during restore (US-534 / US-537).

---

### retryReads \{#retryreads\}

```ts
readonly retryReads: () => void;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L103)

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

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L79)

Board-level search source (US-539 phase B); `null` when the host has not injected an upstream, rebuilt with the upstream after injection.

---

### searchUnavailableReason \{#searchunavailablereason\}

```ts
readonly searchUnavailableReason:
  | BoardSearchUnavailableReason
  | null;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L81)

Stable reason when the search entry is unavailable.

---

### selectBoard \{#selectboard\}

```ts
readonly selectBoard: (boardId) => void;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L111)

Switch board: writes the local record and switches the data streams.

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

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L113)

Enter / leave the restoring state (restore orchestration is driven by the host; this binding only holds the state).

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `value`   | `boolean` |

#### Returns

`void`

---

### taskLabels \{#tasklabels\}

```ts
readonly taskLabels: ReadonlyMap<string, readonly BoardLabel[]>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L95)

Task → its labels (in label creation order).

---

### tasks \{#tasks\}

```ts
readonly tasks: readonly Task[];
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L91)

All tasks of the current board (store order within each column).

---

### undoCount \{#undocount\}

```ts
readonly undoCount: number;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L105)

Number of undoable transactions in this session (used to disable the undo entry).

---

### writeEvent \{#writeevent\}

```ts
readonly writeEvent:
  | {
  kind: string;
  reason?: string;
}
  | null;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L109)

Most recent move / sort write event (success or failure).
