# MAX_BATCH_WAIT_MS

```ts
const MAX_BATCH_WAIT_MS: 100 = 100;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts#L43)

Hard cap (milliseconds) that forces a flush of batched events.

## Remarks

`#schedule_batch_send` resets the pure debounce timer with clearTimeout + setTimeout on every new event;
under sustained writes (bulk import, migration, tight `save()` loops) with intervals shorter than `batchTimeout` the timer is reset forever,
never fires — change events are not dispatched for the whole write period, and `#pending_events` grows unbounded.
This cap guarantees that at most `MAX_BATCH_WAIT_MS` after the first pending event in a batch, a flush is forced,
regardless of subsequent events continuing to arrive.
