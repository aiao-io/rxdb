# RxDBBackupScope

Defined in: [packages/rxdb/src/backup/backup.interface.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L18)

Backup scope declaration (AC#14).

## Remarks

The archive only contains the database; the external files managed by `rxdb-plugin-storage` themselves are **not** in it,
and callers must back them up separately and cannot report a "full application backup succeeded" based on this.

## Properties

### database \{#database\}

```ts
readonly database: "included";
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L20)

All persisted state of the database (user tables, system tables, change history, keyring non-secret metadata).

***

### externalFiles \{#externalfiles\}

```ts
readonly externalFiles: "excluded";
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L22)

External file contents.
