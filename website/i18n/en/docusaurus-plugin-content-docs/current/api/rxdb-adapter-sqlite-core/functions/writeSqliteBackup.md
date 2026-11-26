# writeSqliteBackup()

```ts
function writeSqliteBackup(input, sink, options): Promise<RxDBBackupResult>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.ts:254](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.ts#L254)

Writes a connected SQLite database out as an archive.

## Parameters

| Parameter | Type                                                              | Description                                          |
| --------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| `input`   | [`SqliteBackupInput`](../interfaces/SqliteBackupInput.md)         | Adapter context                                      |
| `sink`    | `WritableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;     | Output stream; closed on success, aborted on failure |
| `options` | [`RxDBBackupOptions`](../../rxdb/interfaces/RxDBBackupOptions.md) | Cancellation signal and queueing time limit          |

## Returns

`Promise`&lt;[`RxDBBackupResult`](../../rxdb/interfaces/RxDBBackupResult.md)&gt;

End marker and manifest

## Remarks

The archive is a logical dump: `sqlite/schema.json` (all table / index / view / trigger creation statements, `user_version`,
`application_id`, `sqlite_sequence`), `sqlite/rows/<table>/<sequence>` segmented by table (`quote()` row literals),
and finally `sqlite/summary.json` (row count per table). Virtual tables only record their creation statement; data is dumped together with their shadow tables.
