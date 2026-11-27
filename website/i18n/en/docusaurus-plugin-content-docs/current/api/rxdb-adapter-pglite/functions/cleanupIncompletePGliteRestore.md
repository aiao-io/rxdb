# cleanupIncompletePGliteRestore()

```ts
function cleanupIncompletePGliteRestore(target): Promise<boolean>;
```

Defined in: [packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts:446](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts#L446)

Cleans up a restore that never finished (the page closed mid-restore, or the cleanup after a failed restore itself failed).

## Parameters

| Parameter | Type                                                          | Description                          |
| --------- | ------------------------------------------------------------- | ------------------------------------ |
| `target`  | [`PGliteRestoreTarget`](../interfaces/PGliteRestoreTarget.md) | The same target used for the restore |

## Returns

`Promise`&lt;`boolean`&gt;

`true` when residue was actually cleaned up

## Remarks

Failing to take the exclusive lock means the target is being connected to or is mid-restore; report `target_busy` instead of deleting a database someone else is using. When there is no marker, do nothing — a healthy database can never be deleted from here.

## Throws

RxDBBackupError `target_busy` / `unsupported_combination` / `cleanup_pending`
