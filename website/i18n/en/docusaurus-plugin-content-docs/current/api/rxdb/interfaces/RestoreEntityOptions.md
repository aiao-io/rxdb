# RestoreEntityOptions

Defined in: [packages/rxdb/src/rxdb-adapter.ts:403](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L403)

Options for restoring a deleted entity

## Remarks

Only valid for **deletes**: `changeId` must point to a DELETE change in `rxdb_change`; restoration works by replaying its `inversePatch` to re-insert the row, so it cannot restore when the log has been trimmed or the id points at a CREATE / UPDATE. To return to the shape before a certain modification, use undo/redo.

The restoration itself produces a new change record (pushable to the remote) instead of erasing the DELETE — the change log is append-only.

## Properties

### changeId \{#changeid\}

```ts
changeId: string;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:405](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L405)

The id of a DELETE-type `rxdb_change` record; implementations parse it with `Number()`, so it can only be a decimal integer string
