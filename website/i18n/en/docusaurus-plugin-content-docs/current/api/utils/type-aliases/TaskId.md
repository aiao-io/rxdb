# TaskId

```ts
type TaskId = string | number;
```

Defined in: [packages/utils/src/async/AsyncQueueExecutor.ts:2](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/async/AsyncQueueExecutor.ts#L2)

Task deduplication id. Tasks with the same id reuse the same Promise until the previous one settles.
