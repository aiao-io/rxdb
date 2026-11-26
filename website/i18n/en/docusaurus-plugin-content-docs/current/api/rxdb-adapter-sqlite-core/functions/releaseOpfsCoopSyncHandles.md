# releaseOpfsCoopSyncHandles()

```ts
function releaseOpfsCoopSyncHandles(vfs): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/opfs-open-retry.ts:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/opfs-open-retry.ts#L143)

Hands over the synchronous access handles and the temporary directory left by `OPFSCoopSyncVFS`: the handles of the database file (including ones opened only later), the handles in the temporary directory, and then releases the lock on the temporary directory (US-221).

## Parameters

| Parameter | Type     | Description                                                                                                               |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `vfs`     | `object` | The `OPFSCoopSyncVFS` instance no longer in use (wa-sqlite and `@subframe7536/sqlite-wasm` share the same implementation) |

## Returns

`void`

## Throws

[RxDBAdapterSqliteError](../classes/RxDBAdapterSqliteError.md) The instance lacks the upstream's `persistentFiles` / `unboundAccessHandles` / `releaser` (the upstream implementation changed)

## Remarks

Upstream `#requestAccessHandle()` opens the handles of the database file and its `-journal` / `-wal` in parallel with `Promise.all`: when the database file fails first, the other two are still opening,
and once opened they hang on `persistentFiles` with nobody closing them; upstream has no `close()` implementation either. Reopening in the same context collides with one's own leftover handles, which only garbage collection
releases — well beyond the backoff window of [openOpfsWithRetry](openOpfsWithRetry.md). Here already-open ones are closed, and handles assigned later are closed as soon as they are assigned,
so it can only be used on an instance no longer in use. The database file's own registration is already replaced by the VFS when the open fails: in the refresh race, the previous page's three handles are released together,
so the situation of side files being held while the database file opens cannot occur.

Temporary directory: each instance opens a `.ahp-*` directory when creating the VFS, pre-opening the handles of several temporary files; the directory is guarded by a Web Lock of the same name, and upstream only releases the lock
when the instance is garbage-collected. The VFS created by the next retry wants to delete it, and the criterion is the lock alone: close the handles in the directory first, then release the lock, and the directory deletion succeeds;
releasing the lock without closing the handles guarantees deletion failure, and doing neither means waiting for garbage collection.
