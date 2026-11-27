# OpfsStorageFilesystem

Defined in: [packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts:145](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts#L145)

The default backend that writes file contents into the browser's OPFS.

## Implements

- [`StorageFilesystem`](../interfaces/StorageFilesystem.md)

## Constructors

### Constructor

```ts
new OpfsStorageFilesystem(rootDir): OpfsStorageFilesystem;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts:153](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts#L153)

#### Parameters

| Parameter | Type     | Description                                        |
| --------- | -------- | -------------------------------------------------- |
| `rootDir` | `string` | The already-normalized storage root relative path. |

#### Returns

`OpfsStorageFilesystem`

## Properties

### lockBackend \{#lockbackend\}

```ts
readonly lockBackend: undefined = undefined;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts:150](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts#L150)

Cross-context serialization under OPFS is handled by the browser's Web Locks;
no backend implementation is needed.

#### Implementation of

[`StorageFilesystem`](../interfaces/StorageFilesystem.md).[`lockBackend`](../interfaces/StorageFilesystem.md#lockbackend)

## Methods

### directoryExists() \{#directoryexists\}

```ts
directoryExists(directoryPath): Promise<boolean>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts:166](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts#L166)

Checks whether a directory exists.

#### Parameters

| Parameter       | Type     |
| --------------- | -------- |
| `directoryPath` | `string` |

#### Returns

`Promise`&lt;`boolean`&gt;

#### Implementation of

[`StorageFilesystem`](../interfaces/StorageFilesystem.md).[`directoryExists`](../interfaces/StorageFilesystem.md#directoryexists)

---

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts:297](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts#L297)

Releases cached handles and connections; called once when the service is destroyed.

#### Returns

`void`

#### Implementation of

[`StorageFilesystem`](../interfaces/StorageFilesystem.md).[`dispose`](../interfaces/StorageFilesystem.md#dispose)

---

### ensureDirectory() \{#ensuredirectory\}

```ts
ensureDirectory(directoryPath): Promise<void>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts:161](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts#L161)

Creates the directory and any missing parent directories; a no-op when it already exists.

#### Parameters

| Parameter       | Type     |
| --------------- | -------- |
| `directoryPath` | `string` |

#### Returns

`Promise`&lt;`void`&gt;

#### Implementation of

[`StorageFilesystem`](../interfaces/StorageFilesystem.md).[`ensureDirectory`](../interfaces/StorageFilesystem.md#ensuredirectory)

---

### ensureRoot() \{#ensureroot\}

```ts
ensureRoot(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts:156](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts#L156)

Ensures the storage root directory exists; throws [StorageUnavailableError](StorageUnavailableError.md)
when the environment does not support it.

#### Returns

`Promise`&lt;`void`&gt;

#### Implementation of

[`StorageFilesystem`](../interfaces/StorageFilesystem.md).[`ensureRoot`](../interfaces/StorageFilesystem.md#ensureroot)

---

### fileExists() \{#fileexists\}

```ts
fileExists(filePath): Promise<boolean>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts:210](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts#L210)

Checks whether a file exists.

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `filePath` | `string` |

#### Returns

`Promise`&lt;`boolean`&gt;

#### Implementation of

[`StorageFilesystem`](../interfaces/StorageFilesystem.md).[`fileExists`](../interfaces/StorageFilesystem.md#fileexists)

---

### list() \{#list\}

```ts
list(directoryPath): AsyncGenerator<StorageFilesystemEntry>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts:201](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts#L201)

Enumerates the direct entries of a directory.

#### Parameters

| Parameter       | Type     |
| --------------- | -------- |
| `directoryPath` | `string` |

#### Returns

`AsyncGenerator`&lt;[`StorageFilesystemEntry`](../interfaces/StorageFilesystemEntry.md)&gt;

#### Remarks

Returns a **lazy** sequence: the service layer collects it into an array itself
when it needs "materialize then delete"; implementors need not, and should not,
materialize eagerly.

#### Implementation of

[`StorageFilesystem`](../interfaces/StorageFilesystem.md).[`list`](../interfaces/StorageFilesystem.md#list)

---

### moveDirectory() \{#movedirectory\}

```ts
moveDirectory(fromPath, toPath): Promise<void>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts:287](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts#L287)

Moves a directory natively; only called when [StorageFilesystem.supportsDirectoryMove](../interfaces/StorageFilesystem.md#supportsdirectorymove) is true.

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `fromPath` | `string` |
| `toPath`   | `string` |

#### Returns

`Promise`&lt;`void`&gt;

#### Implementation of

[`StorageFilesystem`](../interfaces/StorageFilesystem.md).[`moveDirectory`](../interfaces/StorageFilesystem.md#movedirectory)

---

### moveFile() \{#movefile\}

```ts
moveFile(fromPath, toPath): Promise<void>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts:272](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts#L272)

Moves a file natively; only called when [StorageFilesystem.supportsFileMove](../interfaces/StorageFilesystem.md#supportsfilemove) is true.

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `fromPath` | `string` |
| `toPath`   | `string` |

#### Returns

`Promise`&lt;`void`&gt;

#### Implementation of

[`StorageFilesystem`](../interfaces/StorageFilesystem.md).[`moveFile`](../interfaces/StorageFilesystem.md#movefile)

---

### openRead() \{#openread\}

```ts
openRead(filePath): Promise<ReadableStream<Uint8Array<ArrayBufferLike>>>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts:238](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts#L238)

Opens a read stream for the file; throws NotFound when the file does not exist.

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `filePath` | `string` |

#### Returns

`Promise`&lt;`ReadableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;&gt;

#### Remarks

The read/write isolation guarantee is the same as [StorageFilesystem.readBlob](../interfaces/StorageFilesystem.md#readblob)
— that is, no guarantee at all.

#### Implementation of

[`StorageFilesystem`](../interfaces/StorageFilesystem.md).[`openRead`](../interfaces/StorageFilesystem.md#openread)

---

### openWrite() \{#openwrite\}

```ts
openWrite(filePath): Promise<StorageFileWriter>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts:244](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts#L244)

Opens a write handle for the file, creating missing parent directories along the way.

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `filePath` | `string` |

#### Returns

`Promise`&lt;[`StorageFileWriter`](../interfaces/StorageFileWriter.md)&gt;

#### Implementation of

[`StorageFilesystem`](../interfaces/StorageFilesystem.md).[`openWrite`](../interfaces/StorageFilesystem.md#openwrite)

---

### readBlob() \{#readblob\}

```ts
readBlob(filePath): Promise<Blob>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts:224](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts#L224)

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
file via [StorageFilesystem.openRead](../interfaces/StorageFilesystem.md#openread)
and not keep the return value around as a long-term snapshot.

#### Implementation of

[`StorageFilesystem`](../interfaces/StorageFilesystem.md).[`readBlob`](../interfaces/StorageFilesystem.md#readblob)

---

### removeDirectory() \{#removedirectory\}

```ts
removeDirectory(directoryPath): Promise<void>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts:180](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts#L180)

Recursively deletes a directory; returns silently when the directory does not exist.

#### Parameters

| Parameter       | Type     |
| --------------- | -------- |
| `directoryPath` | `string` |

#### Returns

`Promise`&lt;`void`&gt;

#### Implementation of

[`StorageFilesystem`](../interfaces/StorageFilesystem.md).[`removeDirectory`](../interfaces/StorageFilesystem.md#removedirectory)

---

### removeFile() \{#removefile\}

```ts
removeFile(filePath): Promise<void>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts:250](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts#L250)

Deletes a file; returns silently when the file does not exist.

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `filePath` | `string` |

#### Returns

`Promise`&lt;`void`&gt;

#### Implementation of

[`StorageFilesystem`](../interfaces/StorageFilesystem.md).[`removeFile`](../interfaces/StorageFilesystem.md#removefile)

---

### supportsDirectoryMove() \{#supportsdirectorymove\}

```ts
supportsDirectoryMove(directoryPath): Promise<boolean>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts:282](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts#L282)

Checks whether the directory supports native moves; throws NotFound when the directory does not exist.

#### Parameters

| Parameter       | Type     |
| --------------- | -------- |
| `directoryPath` | `string` |

#### Returns

`Promise`&lt;`boolean`&gt;

#### Implementation of

[`StorageFilesystem`](../interfaces/StorageFilesystem.md).[`supportsDirectoryMove`](../interfaces/StorageFilesystem.md#supportsdirectorymove)

---

### supportsFileMove() \{#supportsfilemove\}

```ts
supportsFileMove(filePath): Promise<boolean>;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts:267](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts#L267)

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

#### Implementation of

[`StorageFilesystem`](../interfaces/StorageFilesystem.md).[`supportsFileMove`](../interfaces/StorageFilesystem.md#supportsfilemove)
