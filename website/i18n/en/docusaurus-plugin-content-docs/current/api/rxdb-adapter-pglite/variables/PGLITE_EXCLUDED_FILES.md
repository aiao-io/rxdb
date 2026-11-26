# PGLITE_EXCLUDED_FILES

```ts
const PGLITE_EXCLUDED_FILES: ReadonlySet<string>;
```

Defined in: [packages/rxdb-adapter-pglite/src/backup/pglite-data-dir.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/pglite-data-dir.ts#L21)

File names excluded from archiving (at any depth).

## Remarks

`postmaster.pid` / `postmaster.opts` are process runtime state; carrying them into the target would make the next startup believe an instance is already running. `pg_internal.init` is the relcache cache, which PostgreSQL deletes and rebuilds at startup, and is also a file explicitly excluded by official base backups.
