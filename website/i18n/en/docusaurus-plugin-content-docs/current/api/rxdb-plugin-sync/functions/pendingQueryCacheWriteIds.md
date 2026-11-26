# pendingQueryCacheWriteIds()

```ts
function pendingQueryCacheWriteIds(
   rxdb, 
   namespace, 
   entity
): Promise<ReadonlySet<string>>;
```

Defined in: [packages/rxdb-plugin-sync/src/query-cache-outbox.ts:471](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/query-cache-outbox.ts#L471)

Gets the entity ids of a QueryCache repository currently **held by the outbound queue**.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) | The RxDB instance |
| `namespace` | `string` | The namespace |
| `entity` | `string` | The entity name |

## Returns

`Promise`&lt;`ReadonlySet`&lt;`string`&gt;&gt;

The entity ids in the queue not yet pushed back to the remote; an empty set when the queue is empty

## Remarks

The row-selection conditions are verbatim the same source as
[flushQueryCacheOutbox](flushQueryCacheOutbox.md) (same branch, `remoteId = null`,
`revertChangeId = null`, after the waterline), because "who the queue manages"
and "who gets replayed" must be the same set — the moment two separately
written filters drift is the moment data gets wrongly deleted.

Does **not** look at `RxDBSync.enabled`: with sync turned off for a repository
the queue never flushes, so those rows stay local forever. They are still
user data that exists only locally, and deleting them as "remote returned
nothing = orphan" would lose them for good.

With no `RxDBSync` record it reads everything as "no waterline" and creates no
record: this is a pure read, and creating a record for a repository that has
never synced would conjure a sync state with waterline 0 out of thin air.
