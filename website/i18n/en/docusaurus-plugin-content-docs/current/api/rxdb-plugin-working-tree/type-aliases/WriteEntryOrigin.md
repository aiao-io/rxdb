# WriteEntryOrigin

```ts
type WriteEntryOrigin = 'local' | 'remote_sync';
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts#L109)

A unit's origin

## Remarks

This is a different question from "should it enter the changelog", even if today the answers line up
one-to-one. The failure shape FR-046 calls out by name is pull-written entities being treated as local edits
and pushed back (push echo); merged into one field, "should a `remote_sync` unit be pushed" would have no
code location left to change.
