# StorageFilesystem

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L65)

The minimal set of filesystem capabilities the storage plugin depends on.

## Remarks

The method set is derived backwards from the actual call sites of
[RxdbFileStorage](../classes/RxdbFileStorage.md), no more and no less — an extra
method would have no test coverage, and one fewer would leak handle details
back into the service layer.

## Properties

### lockBackend? \{#lockbackend\}

```ts
readonly lockBackend?: Pick<LockManager, "request">;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L73)

The cross-context lock implementation; returning `undefined` means the PathLockManager probes the environment itself.

#### Remarks

The OPFS backend returns `undefined` (the browser's Web Locks already cover
same-origin multi-tab cases); the desktop backend must return a host-arbitrated
implementation, otherwise the critical sections of multiple windows would each go their own way.

## Methods

### directoryExists() \{#directoryexists\}

```ts
directoryExists(directoryPath): Promise<boolean>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L82)

Checks whether a directory exists.

#### Parameters

| Parameter       | Type     |
| --------------- | -------- |
| `directoryPath` | `string` |

#### Returns

`Promise`&lt;`boolean`&gt;

---

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:145](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L145)

Releases cached handles and connections; called once when the service is destroyed.

#### Returns

`void`

---

### ensureDirectory() \{#ensuredirectory\}

```ts
ensureDirectory(directoryPath): Promise<void>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L79)

Creates the directory and any missing parent directories; a no-op when it already exists.

#### Parameters

| Parameter       | Type     |
| --------------- | -------- |
| `directoryPath` | `string` |

#### Returns

`Promise`&lt;`void`&gt;

---

### ensureRoot() \{#ensureroot\}

```ts
ensureRoot(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L76)

Ensures the storage root directory exists; throws [StorageUnavailableError](../classes/StorageUnavailableError.md)
when the environment does not support it.

#### Returns

`Promise`&lt;`void`&gt;

---

### fileExists() \{#fileexists\}

```ts
fileExists(filePath): Promise<boolean>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L97)

Checks whether a file exists.

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `filePath` | `string` |

#### Returns

`Promise`&lt;`boolean`&gt;

---

### list() \{#list\}

```ts
list(directoryPath): AsyncIterable<StorageFilesystemEntry>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L94)

Enumerates the direct entries of a directory.

#### Parameters

| Parameter       | Type     |
| --------------- | -------- |
| `directoryPath` | `string` |

#### Returns

`AsyncIterable`&lt;[`StorageFilesystemEntry`](StorageFilesystemEntry.md)&gt;

#### Remarks

Returns a **lazy** sequence: the service layer collects it into an array itself
when it needs "materialize then delete"; implementors need not, and should not,
materialize eagerly.

---

### moveDirectory() \{#movedirectory\}

```ts
moveDirectory(fromPath, toPath): Promise<void>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:142](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L142)

Moves a directory natively; only called when [StorageFilesystem.supportsDirectoryMove](#supportsdirectorymove) is true.

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `fromPath` | `string` |
| `toPath`   | `string` |

#### Returns

`Promise`&lt;`void`&gt;

---

### moveFile() \{#movefile\}

```ts
moveFile(fromPath, toPath): Promise<void>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:136](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L136)

Moves a file natively; only called when [StorageFilesystem.supportsFileMove](#supportsfilemove) is true.

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `fromPath` | `string` |
| `toPath`   | `string` |

#### Returns

`Promise`&lt;`void`&gt;

---

### openRead() \{#openread\}

```ts
openRead(filePath): Promise<ReadableStream<Uint8Array<ArrayBufferLike>>>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L119)

Opens a read stream for the file; throws NotFound when the file does not exist.

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `filePath` | `string` |

#### Returns

`Promise`&lt;`ReadableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;&gt;

#### Remarks

The read/write isolation guarantee is the same as [StorageFilesystem.readBlob](#readblob)
— that is, no guarantee at all.

---

### openWrite() \{#openwrite\}

```ts
openWrite(filePath): Promise<StorageFileWriter>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L122)

Opens a write handle for the file, creating missing parent directories along the way.

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `filePath` | `string` |

#### Returns

`Promise`&lt;[`StorageFileWriter`](StorageFileWriter.md)&gt;

---

### readBlob() \{#readblob\}

```ts
readBlob(filePath): Promise<Blob>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L111)

Reads the full contents of a file.

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `filePath` | `string` |

#### Returns

`Promise`&lt;`Blob`&gt;

#### Remarks

**No read/write isolation is guaranteed**: during a concurrent write, the return
value only promises "some byte sequence was read" — it may be the old content,
the new content, or a splice of both. The OPFS backend throws when a File System
snapshot is invalidated, while the desktop backend reads frame by frame and can
see torn content — the interface only takes the intersection of the two, and
callers must not rely on the stronger side, otherwise switching backends would
fail silently.

Serialization is therefore the service layer's path locks' job, not this
method's. Callers that need read-then-write should still spill to a temporary
file via [StorageFilesystem.openRead](#openread) and not keep the return value
around as a long-term snapshot.

---

### removeDirectory() \{#removedirectory\}

```ts
removeDirectory(directoryPath): Promise<void>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L85)

Recursively deletes a directory; returns silently when the directory does not exist.

#### Parameters

| Parameter       | Type     |
| --------------- | -------- |
| `directoryPath` | `string` |

#### Returns

`Promise`&lt;`void`&gt;

---

### removeFile() \{#removefile\}

```ts
removeFile(filePath): Promise<void>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L125)

Deletes a file; returns silently when the file does not exist.

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `filePath` | `string` |

#### Returns

`Promise`&lt;`void`&gt;

---

### supportsDirectoryMove() \{#supportsdirectorymove\}

```ts
supportsDirectoryMove(directoryPath): Promise<boolean>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L139)

Checks whether the directory supports native moves; throws NotFound when the directory does not exist.

#### Parameters

| Parameter       | Type     |
| --------------- | -------- |
| `directoryPath` | `string` |

#### Returns

`Promise`&lt;`boolean`&gt;

---

### supportsFileMove() \{#supportsfilemove\}

```ts
supportsFileMove(filePath): Promise<boolean>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:133](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L133)

Checks whether the file supports native moves.

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `filePath` | `string` |

#### Returns

`Promise`&lt;`boolean`&gt;

#### Remarks

Throws NotFound when the file does not exist — the caller uses this to discover,
in a rename pre-check, that the source file has disappeared.
