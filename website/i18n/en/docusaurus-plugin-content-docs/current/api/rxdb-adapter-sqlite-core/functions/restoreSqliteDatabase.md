# restoreSqliteDatabase()

```ts
function restoreSqliteDatabase(
   source, 
   input, 
   options
): Promise<SqliteRestoreOutcome>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:726](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts#L726)

Restores an archive produced by [writeSqliteBackup](writeSqliteBackup.md) into an empty SQLite database.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | `ReadableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt; | Archive byte stream |
| `input` | [`SqliteRestoreInput`](../interfaces/SqliteRestoreInput.md) | Adapter context |
| `options` | [`SqliteRestoreOptions`](../interfaces/SqliteRestoreOptions.md) | Cancellation signal and stage callbacks |

## Returns

`Promise`&lt;[`SqliteRestoreOutcome`](../interfaces/SqliteRestoreOutcome.md)&gt;

End marker, manifest, and the connection of an in-memory target

## Remarks

Only writes into an **empty** target, with no merging or overwriting. Compatibility (adapter, engine major version, virtual table modules, system table / change encoding version,
entity schema fingerprint, encryption auth domain) is determined before the first statement is written. Schema and rows are replayed in the same transaction; the commit only happens after the summary, watermark, and structure
all check out; any failure rolls back.

- Persistent targets: an exclusive Web Lock blocks concurrent connections and concurrent restores, and the in-database marker table blocks the next connection after "the page was closed mid-restore".
  On failure everything in the target is deleted, and the target returns to the never-restored state.
- In-memory targets: the restored connection is handed to the adapter for takeover via [SqliteRestoreOutcome.client](../interfaces/SqliteRestoreOutcome.md#client).

The client's change events are muted during restore: restored rows are not new changes. The input stream is cancelled on failure, and only the read lock is released on success.

## Throws

RxDBBackupError see RxDBBackupErrorCode; `cleanup_pending` means even the cleanup after the failure did not finish
