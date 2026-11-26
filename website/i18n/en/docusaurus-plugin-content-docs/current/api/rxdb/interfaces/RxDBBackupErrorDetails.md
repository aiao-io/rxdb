# RxDBBackupErrorDetails

Defined in: [packages/rxdb/src/backup/backup-error.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-error.ts#L47)

Structured details of a backup error.

## Properties

### actual? \{#actual\}

```ts
readonly actual?: unknown;
```

Defined in: [packages/rxdb/src/backup/backup-error.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-error.ts#L53)

The actual value in the archive or on site.

---

### expected? \{#expected\}

```ts
readonly expected?: unknown;
```

Defined in: [packages/rxdb/src/backup/backup-error.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-error.ts#L51)

The value the target expects.

---

### field? \{#field\}

```ts
readonly field?: string;
```

Defined in: [packages/rxdb/src/backup/backup-error.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-error.ts#L49)

The metadata field or format position that went wrong, e.g. `rxdb.systemSchemaVersion`, `sha256`.
