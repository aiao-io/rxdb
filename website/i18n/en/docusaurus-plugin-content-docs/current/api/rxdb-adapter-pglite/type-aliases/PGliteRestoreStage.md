# PGliteRestoreStage

```ts
type PGliteRestoreStage = 'marker-written' | 'files-written' | 'verified' | 'persisted';
```

Defined in: [packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts#L62)

The stage restore has reached; each fires once, in order.

- `marker-written`: the "restore in progress" marker is persisted; writing to the target begins next
- `files-written`: the archive has been written completely and passed the digest check; PostgreSQL has started on it
- `verified`: the engine and system-table watermarks match the manifest
- `persisted`: data has been flushed to persistent storage; only marker deletion remains

Memory targets have neither a marker nor persistence; only `files-written` and `verified` fire.
