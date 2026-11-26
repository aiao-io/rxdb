# UseBoardOptions

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L68)

Optional parameters of [useBoard](../functions/useBoard.md).

## Properties

### search? \{#search\}

```ts
readonly search?: object;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L72)

In-board search (US-539 phase B): injects the upstream full-text source (search plugin instance). No search capability when not provided.

#### upstream

```ts
readonly upstream: BoardSearchUpstream;
```

---

### searchUnavailableReason? \{#searchunavailablereason\}

```ts
readonly searchUnavailableReason?: BoardSearchUnavailableReason;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L74)

The host explains the reason when search is unavailable.

---

### storage? \{#storage\}

```ts
readonly storage?: UseBoardStorage;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L70)

Local record storage (localStorage by default; tests inject an in-memory table).
