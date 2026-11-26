# releaseOpfsCoopSyncHandles()

```ts
function releaseOpfsCoopSyncHandles(vfs): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/opfs-open-retry.ts:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/opfs-open-retry.ts#L143)

Releases the sync access handles and temporary directory left behind by `OPFSCoopSyncVFS`: the handles of database files (including ones opened later), the handles in the temporary directory,
and then releases the temporary directory's lock (US-221).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `vfs` | `object` | An `OPFSCoopSyncVFS` instance no longer in use (wa-sqlite and `@subframe7536/sqlite-wasm` share the same implementation) |

## Returns

`void`

## Throws

[RxDBAdapterSqliteError](../classes/RxDBAdapterSqliteError.md) when the instance lacks upstream's `persistentFiles` / `unboundAccessHandles` / `releaser` (the upstream implementation changed)

## Remarks

Upstream `#requestAccessHandle()` opens the database file and the `-journal` / `-wal` handles in parallel with `Promise.all`: when the database file fails first, the other two are still opening,
and once opened they hang on `persistentFiles` with nobody closing them; upstream also has no `close()` implemented. Reopening in the same context then collides with its own leftover handles, which are only released on garbage collection —
impossible to wait for within [openOpfsWithRetry](openOpfsWithRetry.md)'s backoff window. This closes the already-open ones and makes handles assigned later close the moment they are assigned,
so it may only be used on an instance that is no longer in use. The database file's own registration has already been swapped out by the VFS when the open failed: in a refresh race, the previous page's three handles are all released together,
so there is no situation where a side file is held while the database file could be opened.

Temporary directory: each instance opens a `.ahp-*` directory when building the VFS and pre-opens several temporary file handles; the directory is guarded by a same-name Web Lock, and upstream only releases the lock
when the instance is garbage collected. The next retry's fresh VFS wants to delete it, and the criterion is only the lock: close the handles in the directory first, then release the lock, and the directory delete succeeds;
releasing the lock without closing the handles makes the directory delete fail, and doing neither means waiting for garbage collection.
