# hasRxDBBackupWebLocks()

```ts
function hasRxDBBackupWebLocks(): boolean;
```

Defined in: [packages/rxdb/src/backup/backup-lock.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-lock.ts#L18)

Whether the current environment provides Web Locks.

## Returns

`boolean`

`true` when `navigator.locks` is present
