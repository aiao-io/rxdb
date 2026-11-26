# SyncStateSources

Defined in: [packages/rxdb/src/sync-state.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L111)

The upstream data sources of [SyncStateHub](../classes/SyncStateHub.md)

## Remarks

The two streams subscribe independently; either one being a cold stream (or never emitting) does not hold up the other —
using `combineLatest` would require both to have emitted first, and one cold stream could leave the whole panel stuck at its initial values forever.

The QueryCache outbox count is not here: it has no natural live stream (the watermark lives in `rxdb_sync`,
and advancing it does not write `rxdb_change`, so live queries cannot see it), so the sync mechanism reports it proactively at two known moments instead,
see [SyncStateHub.reportOutboxCount](../classes/SyncStateHub.md#reportoutboxcount).

## Properties

### online$ \{#online\}

```ts
online$: Observable<boolean>;
```

Defined in: [packages/rxdb/src/sync-state.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L113)

Remote reachability, from `ReachabilityMonitor.online$`
