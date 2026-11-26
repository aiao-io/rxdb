# WriteEntryOrigin

```ts
type WriteEntryOrigin = 'local' | 'remote_sync';
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts#L109)

The origin of a unit

## Remarks

A different question from "should it enter the changelog", even though today the answers correspond one-to-one. The failure shape named by FR-046 is entities
written in by pull being treated as local edits and pushed back (push echo); merging the two into one field would leave "should a `remote_sync`
unit be pushed" with no code location to change.
