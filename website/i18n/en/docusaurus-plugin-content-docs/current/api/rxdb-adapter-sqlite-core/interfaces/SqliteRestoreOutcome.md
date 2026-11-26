# SqliteRestoreOutcome

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts#L61)

The result of [restoreSqliteDatabase](../functions/restoreSqliteDatabase.md).

## Properties

### client? \{#client\}

```ts
readonly client?: SqliteClientLike;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts#L64)

The connection restored for an in-memory target (change event collection already resumed), taken over by the adapter; empty for persistent targets.

***

### result \{#result\}

```ts
readonly result: RxDBRestoreResult;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts#L62)
