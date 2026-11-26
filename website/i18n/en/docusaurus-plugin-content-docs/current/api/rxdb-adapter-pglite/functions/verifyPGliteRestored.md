# verifyPGliteRestored()

```ts
function verifyPGliteRestored(db, manifest): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts:179](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts#L179)

Verifies that the restored database really is the database declared by the manifest, not merely bytes whose digests check out.

## Parameters

| Parameter  | Type                                                                | Description                                                                                 |
| ---------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `db`       | [`PGliteQueryable`](../interfaces/PGliteQueryable.md)               | A PGlite already started on the restored data directory, or an equivalent query entry point |
| `manifest` | [`RxDBBackupManifest`](../../rxdb/interfaces/RxDBBackupManifest.md) | The archive manifest                                                                        |

## Returns

`Promise`&lt;`void`&gt;

## Remarks

Called before the restore target becomes externally visible: the engine compatibility key, the system-table structure version, and the change-encoding version must all match the manifest. Restores on the desktop host query the target runtime over IPC and go through this same verification.

## Throws

RxDBBackupError `corrupt_archive`, with `details.field` naming the mismatched field
