# readCommitLogPage()

```ts
function readCommitLogPage(executor, branchId, options?): Promise<CommitLogPage>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-log.ts:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-log.ts#L131)

Reads a branch's commit history, translated into one page of the public surface.

## Parameters

| Parameter  | Type                                                                  | Description                                                                            |
| ---------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The caller's transaction executor; this function does **not open its own transaction** |
| `branchId` | `string`                                                              | The branch to read; the caller (the facade) takes it from the active branch token      |
| `options?` | [`CommitLogOptions`](../interfaces/CommitLogOptions.md)               | See [CommitLogOptions](../interfaces/CommitLogOptions.md)                              |

## Returns

`Promise`&lt;[`CommitLogPage`](../interfaces/CommitLogPage.md)&gt;

See [CommitLogPage](../interfaces/CommitLogPage.md)

## Throws

RxDBError when that branch's ref row is missing (`0004` never finished, not empty history)

## Remarks

The ref row is read twice (once here for `headCommitId`, once in listCommits): both are primary-key point reads in the same transaction. Saving one read would require `listCommits()` to return the ref along with it, which would give the traversal function's return value a second shape for the sake of one display field.
