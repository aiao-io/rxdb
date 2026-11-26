# RxdbFileStorage

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L102)

The file storage service that saves files via [StorageFilesystem](../interfaces/StorageFilesystem.md)
and metadata via RxDB.

## Remarks

The default backend is the browser OPFS; desktop hosts can switch to native
files via [RxDBStoragePluginOptions.filesystem](../interfaces/RxDBStoragePluginOptions.md#filesystem).
Writes to the same path run serially within the current instance.
[destroy](#destroy) first rejects new tasks, waits for the write tasks already
started, and then releases the object URLs and backend handles; a destroyed
instance cannot be reinitialized.

## Constructors

### Constructor

```ts
new RxdbFileStorage(
   rxdb, 
   options?, 
   entityType?, 
   objectUrls?
): RxdbFileStorage;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:205](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L205)

Creates the file storage service.

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) | `undefined` | The RxDB instance the metadata belongs to. |
| `options?` | [`RxDBStoragePluginOptions`](../interfaces/RxDBStoragePluginOptions.md) | `{}` | The OPFS root directory and preview limits. |
| `entityType?` | *typeof* [`StorageFileMeta`](StorageFileMeta.md) | `StorageFileMeta` | The metadata entity type; mainly for tests or custom entities. |
| `objectUrls?` | [`ObjectUrlRegistry`](ObjectUrlRegistry.md) | `...` | The object URL ownership registry. |

#### Returns

`RxdbFileStorage`

## Accessors

### activeObjectUrlCount \{#activeobjecturlcount\}

#### Get Signature

```ts
get activeObjectUrlCount(): number;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:183](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L183)

The number of object URLs currently held by the service and not yet revoked.

##### Returns

`number`

***

### changeEpoch \{#changeepoch\}

#### Get Signature

```ts
get changeEpoch(): number;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:193](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L193)

The current capture epoch: monotonically increasing, incremented at the end of every write operation.

##### Remarks

Read-only, used by DevTools diagnostic snapshots for "consistent before and
after" judgments; consumers should not rely on its absolute value, only on equality comparisons.

##### Returns

`number`

## Methods

### clear() \{#clear\}

```ts
clear(path?): Promise<void>;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:610](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L610)

Clears the entire storage, or deletes the files and metadata in the subtree of the given directory.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `path?` | `string` |

#### Returns

`Promise`&lt;`void`&gt;

***

### createDirectory() \{#createdirectory\}

```ts
createDirectory(name, options?): Promise<string>;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:501](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L501)

Creates the directory and any missing parent directories.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `options?` | [`CreateDirectoryOptions`](../interfaces/CreateDirectoryOptions.md) |

#### Returns

`Promise`&lt;`string`&gt;

The storage absolute path of the new directory.

***

### createObjectUrl() \{#createobjecturl\}

```ts
createObjectUrl(fileId): Promise<string>;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:348](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L348)

Creates an object URL held by this service for a file.

Callers should release it via [revokeObjectUrl](#revokeobjecturl);
[destroy](#destroy) revokes all leftover URLs.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `fileId` | `string` |

#### Returns

`Promise`&lt;`string`&gt;

***

### delete() \{#delete\}

```ts
delete(fileId): Promise<void>;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:570](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L570)

Deletes the metadata and its OPFS file; runs compensation when either fails.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `fileId` | `string` |

#### Returns

`Promise`&lt;`void`&gt;

***

### destroy() \{#destroy\}

```ts
destroy(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:654](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L654)

Permanently destroys the current service instance.

The first call immediately rejects new tasks, waits for the write tasks already
started, and then reclaims resources; repeated calls return the same Promise.

#### Returns

`Promise`&lt;`void`&gt;

***

### download() \{#download\}

```ts
download(fileId, options?): Promise<void>;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:365](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L365)

Saves the file via the file picker or a browser download link.

Only the user cancelling the file picker returns silently; errors in the write
phase are thrown unchanged.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `fileId` | `string` |
| `options?` | [`DownloadOptions`](../interfaces/DownloadOptions.md) |

#### Returns

`Promise`&lt;`void`&gt;

***

### fetch() \{#fetch\}

```ts
fetch(opfsPath, options): Promise<Blob>;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:282](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L282)

Fetches a resource from a remote URL and persists it into OPFS.

Behavior:
- If a cache already exists at `opfsPath`, returns the cached Blob directly with
  no request (permanent cache; no ETag/TTL judgment).
- Concurrent calls for the same path share the same in-flight Promise; a later
  caller with a different mimeType waits for the in-flight one to finish and
  then reads from the cache (OPFS is ready by then), applying its own mimeType
  to its own return — but it **does not modify the meta.mimeType already on
  disk**: the caller that finishes first decides the mime on the meta.
- `navigator.onLine === false` throws [StorageOfflineError](StorageOfflineError.md) immediately.
- The response MIME is `options.mimeType` ?? the `Content-Type` header (with
  parameters automatically stripped); when both are missing, throws
  [StorageMimeTypeMissingError](StorageMimeTypeMissingError.md).
- An already-aborted `options.signal` throws `AbortError` immediately; aborting
  mid-download never pollutes the cache.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opfsPath` | `string` | The relative path inside OPFS (e.g. `images/foo.png`); used as the cache key after normalization. |
| `options` | [`FetchRemoteOptions`](../interfaces/FetchRemoteOptions.md) | See [FetchRemoteOptions](../interfaces/FetchRemoteOptions.md). |

#### Returns

`Promise`&lt;`Blob`&gt;

The Blob persisted into OPFS, with `type` equal to the final MIME.

#### Remark

On the cached-hit branch: `options.mimeType` only affects **the type of the
Blob returned this time** and does not modify the stored meta.mimeType; the next
read via `read(meta.id)` still has the original mime.

***

### getMeta() \{#getmeta\}

```ts
getMeta(fileId): Promise<StorageFileMeta | null>;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:422](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L422)

Returns the metadata by ID; returns `null` when it does not exist.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `fileId` | `string` |

#### Returns

`Promise`&lt;[`StorageFileMeta`](StorageFileMeta.md) \| `null`&gt;

***

### init() \{#init\}

```ts
init(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:221](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L221)

Initializes the storage root directory.

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[StorageUnavailableError](StorageUnavailableError.md) is thrown when the
current environment does not support the selected backend.

#### Throws

[StorageDestroyedError](StorageDestroyedError.md) is thrown when the service has
already started destroying.

***

### list() \{#list\}

```ts
list(options?): Promise<StorageFileMeta[]>;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:440](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L440)

Lists metadata.

- `path` omitted: returns all metadata in the whole database (across directories).
- `path` given: by default returns only the **direct** files of that directory;
  `recursive: true` also includes subdirectories.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`ListOptions`](../interfaces/ListOptions.md) |

#### Returns

`Promise`&lt;[`StorageFileMeta`](StorageFileMeta.md)[]&gt;

#### Remarks

STOR-005: the filter was previously written as `options.path ? ... : true`, so
although `path: ''` was normalized by [normalizeDirectoryPath](../functions/normalizeDirectoryPath.md)
into the root directory, the empty string being falsy landed it in the
"directory not restricted" branch and returned the whole tree — one normalized
result, two behaviors. Now it always judges by "whether `path` was explicitly
passed", and `''` and `'/'` behave identically. The README previously claimed
this method "only returns the direct files of the current directory", which did
not match the default behavior and has been corrected in sync.

***

### listAllMetas() \{#listallmetas\}

```ts
listAllMetas(): Promise<StorageFileMeta[]>;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:628](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L628)

Reads all metadata for diagnostic snapshots (US-904 AC#48).

#### Returns

`Promise`&lt;[`StorageFileMeta`](StorageFileMeta.md)[]&gt;

#### Remarks

Ordering is the same as [RxdbFileStorage.list](#list) (by `opfsPath`). The
snapshot source materializes the "meta" side accordingly.

***

### listEntries() \{#listentries\}

```ts
listEntries(options?): Promise<StorageBrowserEntry[]>;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:454](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L454)

Lists the direct subdirectories of the given directory and the direct files already tracked by metadata.

Orphan files are never exposed to the caller; results are ordered with
directories first, then by ascending name.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`ListOptions`](../interfaces/ListOptions.md) |

#### Returns

`Promise`&lt;[`StorageBrowserEntry`](../type-aliases/StorageBrowserEntry.md)[]&gt;

***

### preview() \{#preview\}

```ts
preview(fileId): Promise<StoragePreviewResult>;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:329](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L329)

Creates a preview result with explicit dispose ownership.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `fileId` | `string` |

#### Returns

`Promise`&lt;[`StoragePreviewResult`](../interfaces/StoragePreviewResult.md)&gt;

#### Throws

[StoragePreviewLimitError](StoragePreviewLimitError.md) is thrown when the file
exceeds the configured preview limit.

***

### read() \{#read\}

```ts
read(fileId): Promise<Blob>;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:251](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L251)

Reads the file snapshot corresponding to the metadata.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `fileId` | `string` |

#### Returns

`Promise`&lt;`Blob`&gt;

The content Blob, with `type` always equal to the MIME recorded in the metadata.

#### Throws

Thrown when the file ID does not exist, the backend file is missing, or the
service has been destroyed.

***

### rename() \{#rename\}

```ts
rename(
   fileId, 
   newName, 
   options?
): Promise<StorageFileMeta>;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:522](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L522)

Renames a file within its original directory.

Prefers native moves when OPFS `move()` is supported; overwrite fully replaces
the target and keeps the source metadata ID.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `fileId` | `string` |
| `newName` | `string` |
| `options?` | [`RenameOptions`](../interfaces/RenameOptions.md) |

#### Returns

`Promise`&lt;[`StorageFileMeta`](StorageFileMeta.md)&gt;

***

### renameDirectory() \{#renamedirectory\}

```ts
renameDirectory(
   directoryPath, 
   newName, 
   options?
): Promise<string>;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:556](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L556)

Renames an entire directory tree within its original parent directory.

overwrite has replace semantics: files and metadata unique to the target are
deleted and never merged with the source tree.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `directoryPath` | `string` |
| `newName` | `string` |
| `options?` | [`RenameOptions`](../interfaces/RenameOptions.md) |

#### Returns

`Promise`&lt;`string`&gt;

***

### revokeObjectUrl() \{#revokeobjecturl\}

```ts
revokeObjectUrl(url): void;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:356](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L356)

Releases a URL previously created by [createObjectUrl](#createobjecturl); revoking twice is a no-op.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `url` | `string` |

#### Returns

`void`

***

### runExclusive() \{#runexclusive\}

```ts
runExclusive<T>(fn, signal?): Promise<T>;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:645](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L645)

Runs `fn` inside the storage global exclusive lock, mutually exclusive with all
path-level write operations (US-904 AC#48).

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fn` | () => `Promise`&lt;`T`&gt; | The critical section |
| `signal?` | `AbortSignal` | Optional; aborting while waiting for the lock gives up the acquisition |

#### Returns

`Promise`&lt;`T`&gt;

#### Remarks

For DevTools diagnostic snapshot materialization: the snapshot must read
metadata and files together, mutually exclusive with writes, otherwise the two
halves belong to different points in time and the panel would report false
absences like "metadata present but file missing".

`signal` covers the **lock-waiting** phase: aborting before a slow write drains
rejects with `signal.reason` and `fn` never runs, leaving no waiter that would
acquire the lock later (the snapshot source's `dispose()` / `cancel()` depends on this).

***

### upload() \{#upload\}

```ts
upload(file, options?): Promise<StorageFileMeta>;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:233](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L233)

Writes the file into OPFS and commits the metadata.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `file` | `File` |
| `options?` | [`UploadOptions`](../interfaces/UploadOptions.md) |

#### Returns

`Promise`&lt;[`StorageFileMeta`](StorageFileMeta.md)&gt;

The newly created or updated metadata; on overwrite the original ID is kept and
`contentVersion` is incremented.

#### Throws

[StorageConflictError](StorageConflictError.md) is thrown when the target
already exists and overwrite is not enabled.

#### Throws

[StorageDestroyedError](StorageDestroyedError.md) is thrown when the service has
already started destroying.

***

### watch() \{#watch\}

```ts
watch(fileId): Observable<StorageFileMeta | null>;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.service.ts:595](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.service.ts#L595)

Observes the metadata changes of a single file.

Emits the current value immediately after subscribing; emits `null` after a
delete, and the stream completes after the service is destroyed.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `fileId` | `string` |

#### Returns

`Observable`&lt;[`StorageFileMeta`](StorageFileMeta.md) \| `null`&gt;
