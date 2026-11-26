# runRxDBBackupWhenQueued()

```ts
function runRxDBBackupWhenQueued<T>(queue, task, options): Promise<T>;
```

Defined in: [packages/rxdb/src/backup/backup-queue.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-queue.ts#L28)

Executes a backup task inside the adapter's serial queue; the queueing itself has a time limit and can be cancelled.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type                                                                | Description                                                  |
| --------- | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| `queue`   | [`AsyncQueueExecutor`](../../utils/classes/AsyncQueueExecutor.md)   | The adapter's serial queue                                   |
| `task`    | () => `Promise`&lt;`T`&gt;                                          | The task to execute when its turn comes                      |
| `options` | [`RxDBBackupQueueOptions`](../interfaces/RxDBBackupQueueOptions.md) | The cancellation signal, queue time limit and operation name |

## Returns

`Promise`&lt;`T`&gt;

The task result

## Remarks

Only the "still queueing" phase is governed by the timeout and cancellation: once a task starts executing, it is handed to its own cancellation logic (the archive writer
checks the signal before every write) — otherwise the timeout callback would release the caller halfway through writing a snapshot while the task still holds the database.
After a timeout or cancellation, the task is skipped when its turn comes; no snapshot is taken again with nobody waiting.

## Throws

RxDBBackupError `aborted` when cancelled while queueing or removed by `clearQueue()`; `lock_timeout` when queueing times out
