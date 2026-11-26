# REMOTE_ENTITY_INVALIDATED_EVENT

```ts
const REMOTE_ENTITY_INVALIDATED_EVENT: "REMOTE_ENTITY_INVALIDATED";
```

Defined in: [packages/rxdb/src/rxdb-events.ts:145](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L145)

Data of a remote entity has changed, and the local query cache for it is no longer trustworthy (US-023).

## Remarks

Reported by the host via [RxDB.invalidateRemoteEntity](../classes/RxDB.md#invalidateremoteentity) when it receives its own push channel (WebSocket / SSE / polling). The granularity is the **entire entity**, not a single row: the invalidation surface of `QueryCache` is determined by the query's `where`, and row-level information is of no use at this layer.

Unrelated to [REMOTE\_CHANGES\_PENDING\_EVENT](REMOTE_CHANGES_PENDING_EVENT.md) — the latter is not in [RxDBEventMap](../interfaces/RxDBEventMap.md) and has no dispatch site anywhere in the repo.
