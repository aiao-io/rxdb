# getOrCreateSyncRecord()

```ts
function getOrCreateSyncRecord(repoSyncRepo, params, instantiate): Promise<RxDBSync>;
```

Defined in: [packages/rxdb/src/sync-contract/sync-record-utils.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-record-utils.ts#L124)

Fetches (or creates on first use) the sync watermark record for a repository/branch.

## Parameters

| Parameter      | Type                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------- |
| `repoSyncRepo` | [`IRepository`](../interfaces/IRepository.md)&lt;_typeof_ [`RxDBSync`](../classes/RxDBSync.md)&gt; |
| `params`       | `GetOrCreateSyncRecordParams`                                                                      |
| `instantiate`  | () => [`RxDBSync`](../classes/RxDBSync.md)                                                         |

## Returns

`Promise`&lt;[`RxDBSync`](../classes/RxDBSync.md)&gt;

## Remarks

There is no atomicity between `find` and `create`: concurrent first-time syncs on the same repository (for example triggering
push and pull at the same time — `HistoryManager.syncing()` only sets a boolean flag, it does not serialize) would leave both
tasks finding no record and both calling create.

The `id` is `${namespace}:${entity}:${branchId}`, which is itself the primary key, so duplicate rows cannot be written;
the cost is that the later one reliably hits a primary key conflict and the whole sync fails. Here, after a failed create, it re-reads by primary key once:
if the record is already there, reuse it (meaning it was a race); otherwise rethrow as-is (meaning it was a genuine write failure).
