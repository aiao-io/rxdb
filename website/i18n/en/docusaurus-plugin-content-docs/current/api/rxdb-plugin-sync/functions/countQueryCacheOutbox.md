# countQueryCacheOutbox()

```ts
function countQueryCacheOutbox(rxdb): Promise<number>;
```

Defined in: [packages/rxdb-plugin-sync/src/query-cache-outbox.ts:417](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/query-cache-outbox.ts#L417)

Counts the change rows of all QueryCache repositories on the current branch not yet pushed back to the remote.

## Parameters

| Parameter | Type                                 | Description       |
| --------- | ------------------------------------ | ----------------- |
| `rxdb`    | [`RxDB`](../../rxdb/classes/RxDB.md) | The RxDB instance |

## Returns

`Promise`&lt;`number`&gt;

The number of change rows awaiting replay; 0 when there are no such repositories

## Remarks

The criteria are the same as [flushQueryCacheOutbox](flushQueryCacheOutbox.md)'s
row-selection conditions (same branch, unpushed, unrolled-back, after the
waterline), just counting in one pass by merging all `offlineWrite && !push`
repositories into one OR group, avoiding a per-repository round trip.

Does **not overlap** with `HistoryManager.pushableCount$`: that side takes
repositories by `capability.push`, and this side takes its complement, so
SyncStateHub can safely add the two numbers directly.
