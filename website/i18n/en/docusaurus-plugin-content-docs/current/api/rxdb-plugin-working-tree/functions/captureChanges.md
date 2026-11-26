# captureChanges()

```ts
function captureChanges(executor, host, options): Promise<number>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:565](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L565)

Captures a batch of change log rows into working tree units (**the whole batch shares one `unitId`**)

## Parameters

| Parameter               | Type                                                                                                                                                                                                                                                                                              | Description                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `executor`              | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md)                                                                                                                                                                                                                             | The transaction the business write is in                                                    |
| `host`                  | [`WorkingTreeCaptureHost`](../interfaces/WorkingTreeCaptureHost.md)                                                                                                                                                                                                                               | The entity manager host used to build instances                                             |
| `options`               | \{ `changes`: readonly [`ChangeCaptureSource`](../interfaces/ChangeCaptureSource.md)[]; `origin`: [`WriteEntryOrigin`](../type-aliases/WriteEntryOrigin.md); `shouldCapture`: (`change`) => `boolean`; `token`: [`ActiveBranchToken`](../interfaces/ActiveBranchToken.md); `unitId`: `string`; \} | The token, origin, and change list                                                          |
| `options.changes`       | readonly [`ChangeCaptureSource`](../interfaces/ChangeCaptureSource.md)[]                                                                                                                                                                                                                          | The change log rows to capture                                                              |
| `options.origin`        | [`WriteEntryOrigin`](../type-aliases/WriteEntryOrigin.md)                                                                                                                                                                                                                                         | The units' origin                                                                           |
| `options.shouldCapture` | (`change`) => `boolean`                                                                                                                                                                                                                                                                           | Whether the entity should enter the working tree; the untracked domain is filtered out here |
| `options.token`         | [`ActiveBranchToken`](../interfaces/ActiveBranchToken.md)                                                                                                                                                                                                                                         | The active branch token this write holds                                                    |
| `options.unitId`        | `string`                                                                                                                                                                                                                                                                                          | The unit id shared by the whole batch                                                       |

## Returns

`Promise`&lt;`number`&gt;

The number of units actually landed (those filtered out by CaptureFilter do not count)

## Remarks

One `unitId` per write primitive (adapter-contract.md §5 "all entities of a complete transaction share one
unitId"): issuing one per row would let a partial restore split one atomic operation in half.

Rows are awaited one by one, not `Promise.all`: folding needs to read existing rows of the same table, and
running concurrently would let two changes to the same entity each read "there is no such row yet" and then
both `create`, colliding on the unique index.

The whole batch shares one [WorkingTreeCaptureBatch](../interfaces/WorkingTreeCaptureBatch.md): the token and
state row are thus read once each, instead of once per change. A batch of M changes goes from `7M` queries
down to `2M + 3` — this is the only stretch of the whole plugin that runs at the **user's write frequency**,
and a bulk import of 500 rows multiplies that coefficient by 500 directly.
