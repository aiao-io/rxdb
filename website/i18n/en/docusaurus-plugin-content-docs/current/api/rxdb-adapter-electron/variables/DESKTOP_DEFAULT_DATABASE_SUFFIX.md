# DESKTOP_DEFAULT_DATABASE_SUFFIX

```ts
const DESKTOP_DEFAULT_DATABASE_SUFFIX: '.sqlite3' = '.sqlite3';
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-options.interface.d.ts:11

Suffix appended when deriving the logical file name from the RxDB database name.

## Remarks

The extension is there so users can recognize at a glance that this is a SQLite file in their app data directory, rather than a pile of bare names with no visible purpose.
