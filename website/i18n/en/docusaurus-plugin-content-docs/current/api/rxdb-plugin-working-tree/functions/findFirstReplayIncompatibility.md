# findFirstReplayIncompatibility()

```ts
function findFirstReplayIncompatibility(
   executor, 
   codec, 
   path
): Promise<
  | RestoreIncompatibility
  | undefined>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:259](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L259)

Finds the first incompatible node along an **already-selected** path.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The current transaction executor |
| `codec` | [`WorkingTreePatchCodecContext`](../interfaces/WorkingTreePatchCodecContext.md) | The metadata resolution context; only `resolveTargetMetadata` is used here |
| `path` | readonly `string`[] | The replay path, in replay order |

## Returns

`Promise`&lt;
  \| [`RestoreIncompatibility`](../interfaces/RestoreIncompatibility.md)
  \| `undefined`&gt;

The first incompatible node, `undefined` when all are compatible

## Remarks

Returns on the first hit and **does not keep reading later nodes** — FR-050's "during the check, no later ChangeSet may be decoded or written" has this `return` as its physical meaning here.

It is exported separately for `restore-command.ts`: that module already called [selectRestoreReplayPath](selectRestoreReplayPath.md) once for "is the target reachable", and running [checkRestoreCompatibility](checkRestoreCompatibility.md) again would traverse the whole parent chain a second time, while nothing can change between the two traversals (same transaction).
