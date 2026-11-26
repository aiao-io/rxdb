# ColdReplaySnapshot

```ts
type ColdReplaySnapshot = readonly ColdReplayRow[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts#L54)

A set of business data rows

## Remarks

The array order is **not** part of the contract: at most one row per identity, and comparison goes by identity.
