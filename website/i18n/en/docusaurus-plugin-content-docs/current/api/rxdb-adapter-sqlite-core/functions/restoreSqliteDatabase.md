# restoreSqliteDatabase()

```ts
function restoreSqliteDatabase(
   source, 
   input, 
   options
): Promise<SqliteRestoreOutcome>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:726](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts#L726)

Restores the archive produced by [writeSqliteBackup](writeSqliteBackup.md) into an empty SQLite database.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | `ReadableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt; | The archive byte stream |
| `input` | [`SqliteRestoreInput`](../interfaces/SqliteRestoreInput.md) | The adapter context |
| `options` | [`SqliteRestoreOptions`](../interfaces/SqliteRestoreOptions.md) | Cancellation signal and stage callbacks |

## Returns

`Promise`&lt;[`SqliteRestoreOutcome`](../interfaces/SqliteRestoreOutcome.md)&gt;

The end marker, the manifest, and the connection for an in-memory target

## Remarks

Only writes to an **empty** target, no merge or overwrite. Compatibility (adapter, engine major version, virtual table modules, system table / change encoding version,
entity structure fingerprint, encryption auth domain) is checked before the first statement is written. Structure and rows are replayed in the same transaction, and it only commits after the summary, watermark, and structure
all check out; any failure rolls back.

- Persistent target: an exclusive Web Lock blocks concurrent connections and concurrent restores; an in-database marker table blocks the next connection after "the page was closed mid-restore".
  On failure, everything in the target is deleted, returning the target to a state as if it was never restored.
- In-memory target: the restored connection is handed to the adapter to take over via [SqliteRestoreOutcome.client](../interfaces/SqliteRestoreOutcome.md#client).

The client's change events are muted during restore: restored rows are not new changes. The input stream is cancelled on failure; on success only the read lock is released.

## Throws

RxDBBackupError See RxDBBackupErrorCode; `cleanup_pending` means even the cleanup after failure was not finished
