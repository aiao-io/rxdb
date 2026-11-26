# restorePGliteDatabase()

```ts
function restorePGliteDatabase(
   source, 
   target, 
   options?
): Promise<PGliteRestoreResult>;
```

Defined in: [packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts:413](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts#L413)

Restores an archive produced by [RxDBAdapterPGlite.backup](../classes/RxDBAdapterPGlite.md#backup) into a new PGlite database.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | `ReadableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt; | The archive byte stream |
| `target` | [`PGliteRestoreTarget`](../interfaces/PGliteRestoreTarget.md) | The not-yet-connected target instance and its adapter options |
| `options?` | [`PGliteRestoreOptions`](../interfaces/PGliteRestoreOptions.md) | Cancellation signal and phase callbacks |

## Returns

`Promise`&lt;[`PGliteRestoreResult`](../interfaces/PGliteRestoreResult.md)&gt;

The end marker, the manifest, and the database handle for memory targets

## Remarks

Only writes into an **empty** target; no merging or overwriting. Compatibility (engine major version, extensions, system-table / change-encoding versions, entity structure fingerprint, encryption authentication domain) is decided before the first byte is written; the archive digest is only known once the stream has been read to the end, so data is first written into a staging area and committed only after the digest matches the content:

- IndexedDB target: an exclusive Web Lock keeps out concurrent connections and concurrent restores, and a persistent marker keeps out the next connection after "the page was closed mid-restore" (reporting `restore_incomplete`, requiring [cleanupIncompletePGliteRestore](cleanupIncompletePGliteRestore.md)). Data is flushed into IndexedDB in one go after verification passes; any failure deletes the target and the marker, returning the target to the never-restored state.
- Memory target: there is no location that could be "opened later"; the restored instance is handed to the target adapter via [PGliteRestoreResult.database](../interfaces/PGliteRestoreResult.md#database).

The target RxDB instance is `init()`-ed (to compute the entity set) but not connected. The input stream is cancelled on failure; on success only the read lock is released.

## Throws

RxDBBackupError, see RxDBBackupErrorCode; `cleanup_pending` means even the cleanup after a failure did not finish

## Example

```typescript
const target = { rxdb, options: { store: 'idb' } };
await restorePGliteDatabase(file.stream(), target);
rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, target.options));
await rxdb.connect('pglite');
```
