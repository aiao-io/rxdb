# DEFAULT_NOTIFY_MAX_BATCH_WAIT_MS

```ts
const DEFAULT_NOTIFY_MAX_BATCH_WAIT_MS: 100 = 100;
```

Defined in: [packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts#L33)

Upper limit (in milliseconds) from when a batch window opens until it **must** flush.

## Remarks

With pure trailing debounce, the timer is reset indefinitely whenever the write interval is smaller than the debounce interval, and not a single event ever gets dispatched (PGL-008). This limit is checked **synchronously** on every NOTIFY arrival — adding another `setTimeout` won't do: a tight `await` loop starves the macrotask queue and the timer never fires (the same phenomenon was observed on the sqlite side as SWM-005).
