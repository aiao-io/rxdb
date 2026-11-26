# removeOpfsFiles()

```ts
function removeOpfsFiles(names): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/worktree/drop-storage.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/worktree/drop-storage.ts#L59)

Deletes a set of files under the OPFS root directory; skips ones that do not exist.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `names` | readonly `string`[] | File names (the database file and its journal side files) |

## Returns

`Promise`&lt;`void`&gt;

## Throws

[RxDBAdapterSqliteError](../classes/RxDBAdapterSqliteError.md) When retries are exhausted and the files are still held; the original error is attached to `cause`

## Remarks

After disconnecting, synchronously accessed handles are not released until the VFS closes the file or the Worker that holds it exits; in between, `removeEntry` reports `NoModificationAllowedError` (some Chromium versions report `InvalidModificationError`), so retry with backoff.
