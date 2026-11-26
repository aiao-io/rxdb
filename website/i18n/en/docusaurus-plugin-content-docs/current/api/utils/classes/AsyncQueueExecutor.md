# AsyncQueueExecutor

Defined in: [packages/utils/src/async/AsyncQueueExecutor.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/async/AsyncQueueExecutor.ts#L38)

An async task queue with a concurrency limit.

Tasks **start** in enqueue order, but completion order depends on their individual durations and is not guaranteed. A single task failure only rejects its own Promise; the queue keeps consuming subsequent tasks.

## Example

```ts
const executor = new AsyncQueueExecutor(2);
const result = await executor.addTask(() => fetch(url));
await executor.waitForAll();
```

## Constructors

### Constructor

```ts
new AsyncQueueExecutor(maxConcurrent?): AsyncQueueExecutor;
```

Defined in: [packages/utils/src/async/AsyncQueueExecutor.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/async/AsyncQueueExecutor.ts#L49)

#### Parameters

| Parameter        | Type     | Default value | Description                      |
| ---------------- | -------- | ------------- | -------------------------------- |
| `maxConcurrent?` | `number` | `3`           | Concurrency limit; defaults to 3 |

#### Returns

`AsyncQueueExecutor`

#### Throws

`RangeError` when `maxConcurrent` is not a positive safe integer

## Methods

### addTask() \{#addtask\}

```ts
addTask<T>(task, id?): Promise<T>;
```

Defined in: [packages/utils/src/async/AsyncQueueExecutor.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/async/AsyncQueueExecutor.ts#L65)

Enqueues a task and returns its result.

When an `id` is given and a task with the same id has not settled yet, the existing Promise is reused and the task does not run again. After the task settles (success or failure), the same id can be enqueued again.

#### Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

#### Parameters

| Parameter | Type                                  | Description                                         |
| --------- | ------------------------------------- | --------------------------------------------------- |
| `task`    | () => `T` \| `Promise`&lt;`T`&gt;     | Task function; may return a sync value or a Promise |
| `id?`     | [`TaskId`](../type-aliases/TaskId.md) | Optional deduplication id                           |

#### Returns

`Promise`&lt;`T`&gt;

The task result; rejects with the same error when the task throws;
rejects with `Error('Task cancelled: queue cleared')` when cancelled
while queued by [AsyncQueueExecutor.clearQueue](#clearqueue)

---

### clearQueue() \{#clearqueue\}

```ts
clearQueue(): void;
```

Defined in: [packages/utils/src/async/AsyncQueueExecutor.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/async/AsyncQueueExecutor.ts#L125)

Clears tasks that have **not started yet**.

Each cancelled task's Promise rejects with `Error('Task cancelled: queue cleared')` and is removed from the dedup table. Tasks **already running** are unaffected and run to completion.

#### Returns

`void`

---

### getQueuedCount() \{#getqueuedcount\}

```ts
getQueuedCount(): number;
```

Defined in: [packages/utils/src/async/AsyncQueueExecutor.ts:163](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/async/AsyncQueueExecutor.ts#L163)

Number of tasks still queued.

#### Returns

`number`

Number of queued tasks; equivalent to `getStatus().queued`

---

### getRunningCount() \{#getrunningcount\}

```ts
getRunningCount(): number;
```

Defined in: [packages/utils/src/async/AsyncQueueExecutor.ts:154](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/async/AsyncQueueExecutor.ts#L154)

Number of tasks currently running.

#### Returns

`number`

Number of running tasks; equivalent to `getStatus().running`

---

### getStatus() \{#getstatus\}

```ts
getStatus(): ExecutorStatus;
```

Defined in: [packages/utils/src/async/AsyncQueueExecutor.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/async/AsyncQueueExecutor.ts#L98)

Reads a snapshot of the current queue state.

#### Returns

[`ExecutorStatus`](../interfaces/ExecutorStatus.md)

Running / queued counts and the current concurrency limit; returns a plain object that does not update with later changes

---

### setMaxConcurrent() \{#setmaxconcurrent\}

```ts
setMaxConcurrent(newMax): void;
```

Defined in: [packages/utils/src/async/AsyncQueueExecutor.ts:114](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/async/AsyncQueueExecutor.ts#L114)

Adjusts the concurrency limit.

Raising it immediately starts more queued tasks; lowering it does not interrupt tasks already running and only affects subsequent scheduling.

#### Parameters

| Parameter | Type     | Description           |
| --------- | -------- | --------------------- |
| `newMax`  | `number` | New concurrency limit |

#### Returns

`void`

#### Throws

`RangeError` when `newMax` is not a positive safe integer

---

### waitForAll() \{#waitforall\}

```ts
waitForAll(): Promise<void>;
```

Defined in: [packages/utils/src/async/AsyncQueueExecutor.ts:144](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/async/AsyncQueueExecutor.ts#L144)

Waits until the queue is drained.

Resolves immediately when the queue is already empty. **Never rejects**: task failures are carried solely by the Promise returned from [AsyncQueueExecutor.addTask](#addtask); here it only means "everything has settled". Enqueueing new tasks after draining does not affect an already-resolved Promise; call again if needed.

#### Returns

`Promise`&lt;`void`&gt;

Resolves after both running and queued tasks have settled
