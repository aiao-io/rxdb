# tryAcquireRxDBBackupLock()

```ts
function tryAcquireRxDBBackupLock(name, mode): Promise<RxDBBackupHeldLock | null>;
```

Defined in: [packages/rxdb/src/backup/backup-lock.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-lock.ts#L34)

Tries to acquire the lock immediately; returns `null` when unavailable, without queueing.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | `string` | The lock name |
| `mode` | `LockMode` | `exclusive` for restore, `shared` for normal connections |

## Returns

`Promise`&lt;[`RxDBBackupHeldLock`](../interfaces/RxDBBackupHeldLock.md) \| `null`&gt;

The held lock, or `null`.

## Remarks

Cross-context mutual exclusion between restore and normal connections uses it: queueing would mean the restore waits behind a connection that may never disconnect, or a connection waits behind a restore that has nothing to do with it — both should fail immediately and let the caller decide.

Web Locks release when the promise returned by the callback settles, so this hands out a promise that never settles by itself, resolved manually by `release()`.
