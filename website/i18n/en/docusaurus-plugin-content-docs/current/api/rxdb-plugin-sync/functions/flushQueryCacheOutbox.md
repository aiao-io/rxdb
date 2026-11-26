# flushQueryCacheOutbox()

```ts
function flushQueryCacheOutbox(rxdb, namespace, entity, options?): Promise<QueryCacheOutboxResult>;
```

Defined in: [packages/rxdb-plugin-sync/src/query-cache-outbox.ts:239](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/query-cache-outbox.ts#L239)

Replays the offline changes backlogged in a QueryCache repository back to the remote.

## Parameters

| Parameter                   | Type                                                                                        | Description                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `rxdb`                      | [`RxDB`](../../rxdb/classes/RxDB.md)                                                        | The RxDB instance, used to get branches, local/remote adapters, and entity configuration                     |
| `namespace`                 | `string`                                                                                    | The entity namespace                                                                                         |
| `entity`                    | `string`                                                                                    | The entity name                                                                                              |
| `options?`                  | \{ `conflictResolver?`: [`ConflictResolver`](../../rxdb/interfaces/ConflictResolver.md); \} | The optional conflict resolver; defaults to [LWWConflictResolver](../../rxdb/classes/LWWConflictResolver.md) |
| `options.conflictResolver?` | [`ConflictResolver`](../../rxdb/interfaces/ConflictResolver.md)                             | -                                                                                                            |

## Returns

`Promise`&lt;[`QueryCacheOutboxResult`](../interfaces/QueryCacheOutboxResult.md)&gt;

This round's replay result

## Throws

RxDBError when the repository does not exist, or its `syncType` is not `'querycache'`

## Remarks

Concurrent calls on the same repository reuse the same in-flight Promise (see inflight).

**A failure aborts the whole round and the waterline never advances**: REST has
no batch-level atomicity, nor per-change confirmation receipts. The few changes
already sent successfully will therefore be resent in the next round — the
same exposure as `pushRepository` failing midway through a batch. Writing
`RxDBChange.remoteId` with a sentinel value would eliminate the resends, but
that field's semantics is "the remote changelog row corresponding to a local
change", and the REST path has no such id; writing it would make
`pull-conflict-utils` and the pushable count read a reference that does not exist.

## Example

```ts
const result = await flushQueryCacheOutbox(rxdb, 'public', 'Recipe');
if (result.failures.length === 0) {
  console.log(`replayed ${result.replayed}, watermark → ${result.watermark}`);
}
```
