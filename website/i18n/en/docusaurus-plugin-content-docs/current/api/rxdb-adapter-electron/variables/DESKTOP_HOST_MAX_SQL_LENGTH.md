# DESKTOP_HOST_MAX_SQL_LENGTH

```ts
const DESKTOP_HOST_MAX_SQL_LENGTH: number;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-protocol-primitives.d.ts:13

Length cap for a single SQL text on the SQLite wire protocol (UTF-16 code units).

## Remarks

Restore splices a row entry from the archive verbatim into an `INSERT … VALUES` statement sent downstream: entries are split at 1 MiB, a single row that exceeds it gets an entry to itself, up to 32 MiB (`SQLITE_BACKUP_MAX_ENTRY_BYTES`). The UTF-8 byte count is never smaller than the UTF-16 code unit count, so 64 Mi code units fit the largest entry plus the statement prefix. Protocol v1's 1_000_000 cannot even fit one regular entry; the relaxation takes effect together with protocol v2, so an old host is rejected at the handshake instead of refusing a statement mid-restore.

The PGlite wire protocol does not follow the relaxation and keeps its own 1_000_000.
