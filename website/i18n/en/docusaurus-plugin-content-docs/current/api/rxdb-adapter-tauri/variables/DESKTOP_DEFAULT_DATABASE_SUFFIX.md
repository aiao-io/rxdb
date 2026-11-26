# DESKTOP_DEFAULT_DATABASE_SUFFIX

```ts
const DESKTOP_DEFAULT_DATABASE_SUFFIX: ".sqlite3" = ".sqlite3";
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-options.interface.d.ts:11

Suffix appended when deriving the logical file name from the RxDB database name.

## Remarks

The extension exists so users can tell at a glance in their own app data directory that this is a
SQLite file, rather than a pile of bare names with no apparent purpose.
