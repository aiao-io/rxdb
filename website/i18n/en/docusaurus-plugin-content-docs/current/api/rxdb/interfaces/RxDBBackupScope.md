# RxDBBackupScope

Defined in: [packages/rxdb/src/backup/backup.interface.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L18)

Backup scope declaration (AC#14).

## Remarks

The archive contains only the database; the external file bodies managed by `rxdb-plugin-storage` are **not**
included, and the caller must back them up separately — this must not be reported as "complete application
backup succeeded".

## Properties

### database \{#database\}

```ts
readonly database: "included";
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L20)

All persisted database state (user tables, system tables, change history, non-secret keyring metadata).

---

### externalFiles \{#externalfiles\}

```ts
readonly externalFiles: "excluded";
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L22)

External file contents.
