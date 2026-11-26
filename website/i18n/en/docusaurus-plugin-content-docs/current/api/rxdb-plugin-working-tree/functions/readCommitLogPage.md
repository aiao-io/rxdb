# readCommitLogPage()

```ts
function readCommitLogPage(executor, branchId, options?): Promise<CommitLogPage>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-log.ts:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-log.ts#L131)

Reads a branch's commit history and translates it into one page of the public surface.

## Parameters

| Parameter  | Type                                                                  | Description                                                                                   |
| ---------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The executor of the caller's transaction; this function **does not open its own transaction** |
| `branchId` | `string`                                                              | The branch to read; the caller (the facade) takes it from the active branch token             |
| `options?` | [`CommitLogOptions`](../interfaces/CommitLogOptions.md)               | See [CommitLogOptions](../interfaces/CommitLogOptions.md)                                     |

## Returns

`Promise`&lt;[`CommitLogPage`](../interfaces/CommitLogPage.md)&gt;

See [CommitLogPage](../interfaces/CommitLogPage.md)

## Throws

RxDBError when the branch's ref row is missing (`0004` did not finish, this is not an empty history)

## Remarks

The ref row is read twice (once here for `headCommitId`, once inside listCommits): both are primary-key point lookups in the same transaction. Saving one read would mean having `listCommits()` pass the ref back as well, and that would grow a second shape on the traversal function's return value for the sake of one display field.
