# captureChanges()

```ts
function captureChanges(executor, host, options): Promise<number>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:565](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L565)

Captures a batch of change log entries into working tree units (**the whole batch shares one `unitId`**)

## Parameters

| Parameter               | Type                                                                                                                                                                                                                                                                                              | Description                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `executor`              | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md)                                                                                                                                                                                                                             | The transaction the business write is in                                             |
| `host`                  | [`WorkingTreeCaptureHost`](../interfaces/WorkingTreeCaptureHost.md)                                                                                                                                                                                                                               | The entity manager host for building instances                                       |
| `options`               | \{ `changes`: readonly [`ChangeCaptureSource`](../interfaces/ChangeCaptureSource.md)[]; `origin`: [`WriteEntryOrigin`](../type-aliases/WriteEntryOrigin.md); `shouldCapture`: (`change`) => `boolean`; `token`: [`ActiveBranchToken`](../interfaces/ActiveBranchToken.md); `unitId`: `string`; \} | Token, origin, and change list                                                       |
| `options.changes`       | readonly [`ChangeCaptureSource`](../interfaces/ChangeCaptureSource.md)[]                                                                                                                                                                                                                          | The change log entries to capture                                                    |
| `options.origin`        | [`WriteEntryOrigin`](../type-aliases/WriteEntryOrigin.md)                                                                                                                                                                                                                                         | Origin of the units                                                                  |
| `options.shouldCapture` | (`change`) => `boolean`                                                                                                                                                                                                                                                                           | Should this entity enter the working tree; the untracked domain is filtered out here |
| `options.token`         | [`ActiveBranchToken`](../interfaces/ActiveBranchToken.md)                                                                                                                                                                                                                                         | The active branch token held by this write                                           |
| `options.unitId`        | `string`                                                                                                                                                                                                                                                                                          | The unit id shared by the whole batch                                                |

## Returns

`Promise`&lt;`number`&gt;

Number of entries that actually became units (those filtered out by CaptureFilter do not count)

## Remarks

One write primitive, one `unitId` (adapter-contract.md §5 "all entities of a complete transaction share the same unitId"):
issuing one per row would let a partial restore split one atomic operation in half.

`await` row by row, not `Promise.all`: folding reads the existing rows of the same table, and running concurrently would let two changes writing the same entity
each read "this row does not exist yet", then both `create` and collide on the unique index.

The whole batch shares one [WorkingTreeCaptureBatch](../interfaces/WorkingTreeCaptureBatch.md): the token and state row are therefore each read once, instead of once per change.
The query count of a batch of M changes drops from `7M` to `2M + 3` — this is the only stretch of the whole plugin that runs at the **user's write frequency**,
and on a bulk import of 500 rows that coefficient multiplies directly onto 500.
