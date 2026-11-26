# UseBoardOptions

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L67)

Optional parameters of [useBoard](../functions/useBoard.md).

## Properties

### search? \{#search\}

```ts
readonly search?: object;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L71)

In-board search (US-539 phase B): injects the upstream full-text source (a search plugin instance). Without it there is no search capability.

#### upstream

```ts
readonly upstream: BoardSearchUpstream;
```

---

### searchUnavailableReason? \{#searchunavailablereason\}

```ts
readonly searchUnavailableReason?: BoardSearchUnavailableReason;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L73)

Host-provided reason when search is unavailable.

---

### storage? \{#storage\}

```ts
readonly storage?: UseBoardStorage;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L69)

Local storage (defaults to localStorage; tests inject an in-memory table).
