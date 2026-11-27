# ColdReplaySnapshot

```ts
type ColdReplaySnapshot = readonly ColdReplayRow[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts#L54)

A group of business data rows

## Remarks

Array order is **not** part of the contract: each identity appears at most once, and comparison proceeds by
identity.
