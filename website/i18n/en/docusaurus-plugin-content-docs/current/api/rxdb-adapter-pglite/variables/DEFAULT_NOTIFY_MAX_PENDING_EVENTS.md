# DEFAULT_NOTIFY_MAX_PENDING_EVENTS

```ts
const DEFAULT_NOTIFY_MAX_PENDING_EVENTS: 5000 = 5000;
```

Defined in: [packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts#L36)

Upper limit of accumulated events within a single window; exceeding it flushes immediately, forming backpressure.
