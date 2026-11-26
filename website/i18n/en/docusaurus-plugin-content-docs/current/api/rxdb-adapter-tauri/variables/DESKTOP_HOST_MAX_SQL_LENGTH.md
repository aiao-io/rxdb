# DESKTOP_HOST_MAX_SQL_LENGTH

```ts
const DESKTOP_HOST_MAX_SQL_LENGTH: number;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-protocol-primitives.d.ts:13

Maximum length of a single SQL statement on the SQLite wire protocol (UTF-16 code units).

## Remarks

Restore splices one row entry from the archive verbatim into an `INSERT … VALUES` statement to send
down: entries are split at 1 MiB, and a row exceeding that gets an entry to itself, up to 32 MiB
(`SQLITE_BACKUP_MAX_ENTRY_BYTES`). The UTF-8 byte count is never less than the UTF-16 code-unit
count, so 64 Mi code units fit the largest entry plus the statement prefix. Protocol v1's 1_000_000
could not fit even a regular entry; the relaxation takes effect with protocol v2, and an old host is
rejected at handshake time rather than refusing one statement in the middle of a restore.

The PGlite wire protocol does not follow the relaxation; it keeps its own 1_000_000.
