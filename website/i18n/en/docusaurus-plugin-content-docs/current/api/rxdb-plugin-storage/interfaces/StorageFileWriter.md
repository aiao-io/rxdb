# StorageFileWriter

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L37)

The write handle for a single file.

## Remarks

The lifecycle has only two terminal states: [StorageFileWriter.close](#close)
commits, or [StorageFileWriter.abort](#abort) discards. The service layer
guarantees that exactly one of the two is called on any path.

## Methods

### abort() \{#abort\}

```ts
abort(reason): Promise<void>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L55)

Discards this write and releases resources.

#### Parameters

| Parameter | Type      | Description                                                                                       |
| --------- | --------- | ------------------------------------------------------------------------------------------------- |
| `reason`  | `unknown` | The original error that triggered the abandonment, for the implementor to record or pass through. |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

This method **must not throw**: it is only called on error-handling paths, and
a second throw would overwrite the real failure cause.

---

### close() \{#close\}

```ts
close(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L47)

Commits all written chunks.

#### Returns

`Promise`&lt;`void`&gt;

---

### write() \{#write\}

```ts
write(chunk): Promise<void>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L45)

Appends a chunk; chunks are concatenated in call order.

#### Parameters

| Parameter | Type                                        |
| --------- | ------------------------------------------- |
| `chunk`   | `Uint8Array`&lt;`ArrayBuffer`&gt; \| `Blob` |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Chunks must be backed by a non-shared `ArrayBuffer`: the underlying write
interface rejects `SharedArrayBuffer` views, so callers must copy chunks read
from a stream before passing them in.
