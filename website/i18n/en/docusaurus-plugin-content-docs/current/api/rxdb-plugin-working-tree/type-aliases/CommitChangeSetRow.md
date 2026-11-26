# CommitChangeSetRow

```ts
type CommitChangeSetRow = Pick<
  CommitChangeSet,
  'unitId' | 'transactionId' | 'namespace' | 'entity' | 'entityId' | 'operation' | 'patch' | 'inversePatch' | 'origin'
>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts#L123)

The nine columns of a `rxdb_commit_change_set` row that participate in restoration.

## Remarks

Taken as a `Pick` rather than the whole CommitChangeSet: restoration only needs these nine columns; narrowing the input lets
[decodeCommitChangeSetUnit](../functions/decodeCommitChangeSetUnit.md) also consume bare row objects directly (ones passed across processes, assembled in tests),
without first constructing an entity instance. The nine columns' values correspond one-to-one with [CommitChangeUnitContent](../interfaces/CommitChangeUnitContent.md).
