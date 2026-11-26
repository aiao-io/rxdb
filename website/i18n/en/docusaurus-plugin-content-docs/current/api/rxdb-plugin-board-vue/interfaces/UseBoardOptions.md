# UseBoardOptions

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L64)

Optional parameters of [useBoard](../functions/useBoard.md).

## Properties

### search? \{#search\}

```ts
readonly search?: object;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L68)

In-board search (US-539 phase B): injects the upstream full-text source (a search plugin instance). Without it there is no search capability.

#### upstream

```ts
readonly upstream: BoardSearchUpstream;
```

***

### searchUnavailableReason? \{#searchunavailablereason\}

```ts
readonly searchUnavailableReason?: BoardSearchUnavailableReason;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L70)

Host-provided reason when search is unavailable.

***

### storage? \{#storage\}

```ts
readonly storage?: UseBoardStorage;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L66)

Local storage (defaults to localStorage; tests inject an in-memory table).
