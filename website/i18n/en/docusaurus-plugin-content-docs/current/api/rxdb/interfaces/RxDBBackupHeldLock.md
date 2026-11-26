# RxDBBackupHeldLock

Defined in: [packages/rxdb/src/backup/backup-lock.ts:2](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-lock.ts#L2)

An acquired Web Lock.

## Methods

### release() \{#release\}

```ts
release(): Promise<void>;
```

Defined in: [packages/rxdb/src/backup/backup-lock.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-lock.ts#L10)

Releases the lock; idempotent.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

The returned promise resolves only after the lock manager has actually released the lock: releasing synchronously
merely settles the callback's promise, while the lock itself is returned one beat later — an immediately following
`tryAcquire` would misjudge the lock it just released as still being held by someone else.
