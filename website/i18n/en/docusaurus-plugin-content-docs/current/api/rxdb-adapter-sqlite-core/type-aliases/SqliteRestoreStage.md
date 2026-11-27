# SqliteRestoreStage

```ts
type SqliteRestoreStage = 'marker-written' | 'rows-written' | 'verified' | 'persisted';
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.interface.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.interface.ts#L59)

Stages a restore progresses through, each fired once in order.

- `marker-written`: the "restore in progress" marker table has been committed, writing to the target begins next
- `rows-written`: schema and all rows have been written, row count matches the archive summary
- `verified`: the system table watermark and database structure have been checked against the manifest / archive
- `persisted`: the transaction has been committed

In-memory targets need no marker and no separate disk write; only `rows-written` and `verified` fire.
