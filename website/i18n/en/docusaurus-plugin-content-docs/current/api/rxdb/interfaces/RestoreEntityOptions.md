# RestoreEntityOptions

Defined in: [packages/rxdb/src/rxdb-adapter.ts:403](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L403)

Parameters for restoring a deleted entity

## Remarks

Only holds for **removals**: `changeId` must point to a DELETE change in `rxdb_change`,
and restoration works by replaying its `inversePatch` to re-insert the row, so it cannot restore when the log has been trimmed,
or when the id points to a CREATE / UPDATE. To get back to a shape before some modification, use undo/redo.

The restoration itself produces another new change record (which can be pushed to the remote) rather than erasing that DELETE —
the change log is append-only.

## Properties

### changeId \{#changeid\}

```ts
changeId: string;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:405](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L405)

The id of the DELETE-type `rxdb_change` record; implementations parse it with `Number()`, so it can only be a decimal integer string
