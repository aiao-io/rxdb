# SQLITE_BACKUP_ENGINE_COMPATIBILITY

```ts
const SQLITE_BACKUP_ENGINE_COMPATIBILITY: "sqlite-3" = 'sqlite-3';
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.interface.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.interface.ts#L13)

The engine data compatibility key.

## Remarks

The archive is a logical dump (structure SQL + row literals), not a database file, and the SQL dialect of SQLite 3 is backward compatible,
so only the major version is judged; among minor version differences the only thing that would really break restore is virtual table modules, and that item is compared separately by the extension list.
