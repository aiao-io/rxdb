# cleanupIncompleteSqliteRestore()

```ts
function cleanupIncompleteSqliteRestore(input): Promise<boolean>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:781](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts#L781)

Cleans up an unfinished restore (the page closed mid-restore, or the cleanup itself failed after the restore failed).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | [`SqliteRestoreInput`](../interfaces/SqliteRestoreInput.md) | Adapter context |

## Returns

`Promise`&lt;`boolean`&gt;

`true` when residue was actually cleaned up

## Remarks

If the exclusive lock cannot be acquired, the target is being connected to or restored; report `target_busy` instead of deleting a database someone else is using. Without a marker, do nothing — a healthy database is never deleted here. An in-memory target has no residue, so this is always `false`.

## Throws

RxDBBackupError `target_busy` / `unsupported_combination` / `cleanup_pending`
