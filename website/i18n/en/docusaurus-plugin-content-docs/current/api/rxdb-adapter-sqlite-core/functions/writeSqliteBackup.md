# writeSqliteBackup()

```ts
function writeSqliteBackup(
   input, 
   sink, 
   options
): Promise<RxDBBackupResult>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.ts:254](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.ts#L254)

Writes the connected SQLite database into an archive.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | [`SqliteBackupInput`](../interfaces/SqliteBackupInput.md) | The adapter context |
| `sink` | `WritableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt; | The output stream; closed on success, aborted on failure |
| `options` | [`RxDBBackupOptions`](../../rxdb/interfaces/RxDBBackupOptions.md) | Cancellation signal and queueing time limit |

## Returns

`Promise`&lt;[`RxDBBackupResult`](../../rxdb/interfaces/RxDBBackupResult.md)&gt;

The end marker and the manifest

## Remarks

The archive is a logical dump: `sqlite/schema.json` (all create table / index / view / trigger statements, `user_version`,
`application_id`, `sqlite_sequence`), `sqlite/rows/<table>/<index>` segmented per table (`quote()` row literals),
and finally `sqlite/summary.json` (the row count of each table). Virtual tables only record the create statements; their data is dumped along with their shadow tables.
