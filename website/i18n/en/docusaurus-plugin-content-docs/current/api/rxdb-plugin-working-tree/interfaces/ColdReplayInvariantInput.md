# ColdReplayInvariantInput

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts:338](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts#L338)

The input of [assertColdReplayInvariant](../functions/assertColdReplayInvariant.md).

## Properties

### actual \{#actual\}

```ts
readonly actual: ColdReplaySnapshot;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts:346](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts#L346)

The actual content read from the business tables

***

### entries \{#entries\}

```ts
readonly entries: readonly WorkingTreeEntry[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts:343](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts#L343)

All uncommitted units on that branch

***

### head \{#head\}

```ts
readonly head: ColdReplaySnapshot;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts:340](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts#L340)

HEAD's business data projection
