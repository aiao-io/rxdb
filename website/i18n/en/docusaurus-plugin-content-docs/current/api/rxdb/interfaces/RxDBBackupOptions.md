# RxDBBackupOptions

Defined in: [packages/rxdb/src/backup/backup.interface.ts:129](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L129)

Backup options.

## Properties

### lockTimeoutMs? \{#locktimeoutms\}

```ts
readonly lockTimeoutMs?: number;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:140](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L140)

The upper bound (in milliseconds) for waiting on the consistency lock; throws `lock_timeout` on timeout.

#### Remarks

Calling backup inside a transaction callback of the same adapter would wait on itself; this upper bound is the
only way out.

#### Default Value

```ts
30000;
```

---

### signal? \{#signal\}

```ts
readonly signal?: AbortSignal;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L131)

Cancels before the successful-commit boundary; a cancellation after it does not roll back a completed backup.
