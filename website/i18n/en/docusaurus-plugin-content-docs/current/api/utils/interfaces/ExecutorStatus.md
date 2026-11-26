# ExecutorStatus

Defined in: [packages/utils/src/async/AsyncQueueExecutor.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/async/AsyncQueueExecutor.ts#L11)

The return value of [AsyncQueueExecutor.getStatus](../classes/AsyncQueueExecutor.md#getstatus).

## Properties

### maxConcurrent \{#maxconcurrent\}

```ts
maxConcurrent: number;
```

Defined in: [packages/utils/src/async/AsyncQueueExecutor.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/async/AsyncQueueExecutor.ts#L17)

The current concurrency limit.

***

### queued \{#queued\}

```ts
queued: number;
```

Defined in: [packages/utils/src/async/AsyncQueueExecutor.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/async/AsyncQueueExecutor.ts#L15)

The number of tasks still queued and not yet started.

***

### running \{#running\}

```ts
running: number;
```

Defined in: [packages/utils/src/async/AsyncQueueExecutor.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/async/AsyncQueueExecutor.ts#L13)

The number of tasks currently executing.
