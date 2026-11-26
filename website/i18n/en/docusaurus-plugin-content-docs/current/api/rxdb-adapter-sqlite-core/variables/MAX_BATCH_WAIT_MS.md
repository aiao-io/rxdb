# MAX_BATCH_WAIT_MS

```ts
const MAX_BATCH_WAIT_MS: 100 = 100;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts#L43)

The hard upper bound (milliseconds) for a forced flush of batched events.

## Remarks

`#schedule_batch_send` resets the pure debounce timer with clearTimeout + setTimeout on every new event;
during sustained writes (batch imports, migrations, tight `save()` loops) with intervals shorter than `batchTimeout`, the timer is reset forever and
never fires — change events are not dispatched for the entire write period, and `#pending_events` grows unbounded.
This upper bound guarantees that, counting from the first pending event in a batch, a forced flush happens at most `MAX_BATCH_WAIT_MS` later,
unaffected by the continuous arrival of subsequent events.
