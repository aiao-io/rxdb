# SQLITE_BACKUP_ENGINE_COMPATIBILITY

```ts
const SQLITE_BACKUP_ENGINE_COMPATIBILITY: "sqlite-3" = 'sqlite-3';
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.interface.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.interface.ts#L13)

Engine data compatibility key.

## Remarks

The archive is a logical dump (schema SQL + row literals), not a database file, and SQLite 3's SQL dialect is backward compatible,
so only the major version is checked; among minor version differences the only thing that really breaks restore is the virtual table modules, and that item is compared separately via the extension list.
