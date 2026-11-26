# RxDBBackupQueueOptions

Defined in: [packages/rxdb/src/backup/backup-queue.ts:5](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-queue.ts#L5)

The options of [runRxDBBackupWhenQueued](../functions/runRxDBBackupWhenQueued.md).

## Properties

### label \{#label\}

```ts
readonly label: string;
```

Defined in: [packages/rxdb/src/backup/backup-queue.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-queue.ts#L11)

The operation name in error messages, such as `PGlite backup`.

---

### signal? \{#signal\}

```ts
readonly signal?: AbortSignal;
```

Defined in: [packages/rxdb/src/backup/backup-queue.ts:7](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-queue.ts#L7)

Cancellation signal: only takes effect while queued.

---

### timeoutMs \{#timeoutms\}

```ts
readonly timeoutMs: number;
```

Defined in: [packages/rxdb/src/backup/backup-queue.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-queue.ts#L9)

Queue time limit (milliseconds); `lock_timeout` is reported when exceeded.
