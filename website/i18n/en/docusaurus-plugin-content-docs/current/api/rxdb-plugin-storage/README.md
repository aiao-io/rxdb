# rxdb-plugin-storage

> Implements: [US-502 Storage plugin](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/plugin/US-502-storage-plugin.md), [US-504 Electron local file storage](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/plugin/US-504-electron-local-file-storage.md)

The RxDB file storage plugin: file metadata is written into RxDB, and file
contents are written into a replaceable filesystem backend.

- **Browser** (default) — contents live in the Origin Private File System (OPFS).
- **Electron desktop** (`@aiao/rxdb-plugin-storage/desktop`) — contents live in
  native files under the application data directory, sharing one backup domain
  with the desktop SQLite database (US-207).

## Scope

- Upload, overwrite, read, delete, and clear files by directory
- Create, list, and rename directories
- Rename files
- Fetch from a remote URL and cache permanently into OPFS
- Preview or download files via `Blob` URLs
- Query and watch file metadata through RxDB
- Compensating rollback for cross-storage updates to file bodies and metadata

The following capabilities are not implemented yet:

- A custom `rxdb-file://` protocol or `file://` URLs
- stale-while-revalidate, ETag, TTL, or remote version negotiation
- Thumbnail generation and multi-level loading chains
- LRU eviction, streaming chunked upload, and resumable uploads
- Cross-device file body sync

## Data model

```ts
interface StorageFileMeta {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  opfsPath: string;
  contentVersion: number;
  createdAt: Date;
  updatedAt: Date;
}
```

- `opfsPath` is a path relative to the plugin's `rootDir`.
- `contentVersion` increments on overwrite writes or remote cache updates.
- File names and directory names allow only single valid path segments; `/`,
  `\\`, empty segments, `.`, `..`, and leading/trailing spaces are rejected and
  are never silently rewritten.

## Public API

```ts
interface RxDBStoragePluginOptions {
  rootDir?: string;
  previewLimitBytes?: number;
  /** Filesystem backend factory; omitted means OPFS. */
  filesystem?: StorageFilesystemFactory;
}

interface UploadOptions {
  path?: string;
  overwrite?: boolean;
}

interface FetchRemoteOptions {
  url: string;
  mimeType?: string;
  signal?: AbortSignal;
}

interface RenameOptions {
  overwrite?: boolean;
}

class RxdbFileStorage {
  readonly activeObjectUrlCount: number;

  init(): Promise<void>;

  upload(file: File, options?: UploadOptions): Promise<StorageFileMeta>;
  read(fileId: string): Promise<Blob>;
  fetch(opfsPath: string, options: FetchRemoteOptions): Promise<Blob>;

  preview(fileId: string): Promise<StoragePreviewResult>;
  createObjectUrl(fileId: string): Promise<string>;
  revokeObjectUrl(url: string): void;
  download(fileId: string, options?: { suggestedName?: string }): Promise<void>;

  getMeta(fileId: string): Promise<StorageFileMeta | null>;
  list(options?: { path?: string; recursive?: boolean }): Promise<StorageFileMeta[]>;
  listEntries(options?: { path?: string }): Promise<StorageBrowserEntry[]>;
  watch(fileId: string): Observable<StorageFileMeta | null>;

  createDirectory(name: string, options?: { path?: string }): Promise<string>;
  rename(fileId: string, newName: string, options?: RenameOptions): Promise<StorageFileMeta>;
  renameDirectory(directoryPath: string, newName: string, options?: RenameOptions): Promise<string>;
  delete(fileId: string): Promise<void>;
  clear(path?: string): Promise<void>;

  destroy(): Promise<void>;
}
```

`db.storage` **only exists while connected**: it is `undefined` before install
and after disconnect. The plugin declares `lifecycle: 'scoped'`; creating the
service, mounting `db.storage`, and registering the metadata entity each take
one scope entry, and `disconnectAll()` unwinds them in reverse order — detach
the entity first, then the property, and finally wait for the storage to drain
its pending writes. A new `connect()` builds a brand-new service instance;
object URLs and handles obtained from the old instance are no longer valid.

Directory semantics of `list()`:

- `path` omitted — returns all file metadata in the whole database (across directories).
- `path` given — returns only the **direct** files of that directory; `''` and
  `'/'` are equivalent and both mean the root directory.
- `path` given plus `recursive: true` — also returns subdirectories.

`listEntries()` only looks at the direct level, returning both direct files and subdirectories.

The cache key of `fetch()` is the normalized `opfsPath`:

- When a cache already exists it is returned directly from the OPFS file, with no network request.
- Concurrent requests for the same path share one in-flight request.
- Non-2xx, offline, abort, or a missing MIME type never pollutes the existing cache.
- When a request fails (including when the response headers have arrived but the
  local temporary file cannot open a write stream), the unconsumed response body
  is cancelled first and the original error is rethrown, leaving no background download.
- This is a permanent cache with no automatic refresh policy.

## Error types

```ts
StorageInvalidPathError;
StorageConflictError;
StorageUnavailableError;
StoragePreviewLimitError;
StorageOfflineError;
StorageFetchError;
StorageMimeTypeMissingError;

// Failures originating from the backend (filesystem / host), with stable error codes
class StorageBackendError extends Error {
  readonly code: StorageBackendErrorCode;
  readonly detail?: unknown;
}

type StorageBackendErrorCode =
  | 'backend_unavailable'
  | 'invalid_physical_name'
  | 'name_too_long'
  | 'permission_denied'
  | 'disk_full'
  | 'write_aborted'
  | 'adapter_mismatch'
  | 'backend_internal_error';
```

Callers should handle errors by type and not match on English error messages.
Failures crossing IPC are discriminated by `code` — structured clone does not
preserve prototypes, so `instanceof` does not hold on the renderer side; the
original cause is exposed via `detail`.

When the main operation fails and the compensating rollback also fails, the
service throws an `AggregateError` whose first error is still the original failure cause.

## Usage

```ts
import { rxDBPluginStorage } from '@aiao/rxdb-plugin-storage';

rxdb.use(rxDBPluginStorage, {
  rootDir: 'files',
  previewLimitBytes: 50 * 1024 * 1024
});

await rxdb.storage.init();

const meta = await rxdb.storage.upload(file, {
  path: '/avatars',
  overwrite: true
});

const preview = await rxdb.storage.preview(meta.id);
try {
  image.src = preview.url;
} finally {
  preview.dispose();
}
```

Remote caching:

```ts
const blob = await rxdb.storage.fetch('images/avatar.png', {
  url: 'https://static.example.com/avatar.png',
  signal: abortController.signal
});
```

## Desktop backend (Electron)

```ts
import { rxDBPluginStorage } from '@aiao/rxdb-plugin-storage';
import { createDesktopStorageFilesystem } from '@aiao/rxdb-plugin-storage/desktop';

rxdb.use(rxDBPluginStorage, {
  rootDir: 'files',
  filesystem: createDesktopStorageFilesystem()
});
```

- File contents live in the application data directory resolved by the main
  process (`userData/rxdb-files` for the sample app) and **never go through
  OPFS**; copying that directory takes the files and the database along in full.
- It reuses the existing US-207 host channel and **adds no preload methods**.
  Reads and writes are framed in 4 MiB chunks and contents never enter the JS heap whole.
- Writes are atomic: temporary file → `fsync` → `rename`. Closing the session or
  destroying the window aborts uncommitted writes and deletes the temporary file.
- Path locks are arbitrated by the host; serialization across windows does not
  depend on WebView's Web Locks.
- Before enabling, `sync.local.adapter` is validated and must be the desktop
  SQLite adapter; a mismatch throws `StorageBackendError('adapter_mismatch')`
  with **no fallback and no silent acceptance** — otherwise metadata and files
  would fall back into two separate backup domains.

### The only behavioral divergence from the OPFS backend

Logical names map to physical file names through a deterministic reversible
encoding (`%XX` escaping for Windows-invalid characters, trailing spaces and
dots, and reserved device names). **A single encoded path segment exceeding 255
UTF-8 bytes throws `StorageBackendError('name_too_long')`**, while the same
operation would still succeed on the OPFS backend.

Not truncating by hash is intentional: `listEntries()` and directory copies must
recover logical names from the physical names on disk, and truncation is
irreversible — once introduced, the original name could never be read back.
Better to fail on write than to write something that can never be read back.

## Runtime requirements

- `rxdb.config.sync.local.adapter` must exist, and metadata must land in the local adapter.
- The browser backend requires a runtime supporting `navigator.storage.getDirectory()`;
  the desktop backend requires the host bridge injected by the preload.
- When `showSaveFilePicker` is available, `download()` uses the file picker;
  otherwise it falls back to a temporary `<a download>`.
- `watch()` observes metadata changes triggered by this plugin and does not
  watch other code modifying files directly, bypassing the plugin.
- Disconnecting revokes all object URLs created by this instance (the host calls
  the service's `destroy()` when releasing the scope).

## Consistency strategy

The filesystem backend and RxDB do not share transactions. The plugin maintains
user-visible consistency with a compensation log:

- Write failure: restore the old file, or delete the orphan file created this time.
- Metadata create/update failure: restore the corresponding file body.
- File delete failure: rebuild the deleted metadata.
- File or directory rename failure: restore the metadata, the target file, and
  the newly created directory, in reverse order.
- A copy-style directory rename (when the backend does not support native
  directory moves) that fails midway while deleting the source directory:
  recursive deletion has no failure atomicity and part of the source directory
  may already be gone. In that case the source directory is first completed from
  the full copy in the target, confirming every registered file is back at its
  original path, and only then is the previous step undone; when completion is
  impossible, no copy is deleted — target and metadata keep the post-rename
  state, the overwritten old target stays in a backup directory, and the thrown
  `AggregateError` message names these paths.

This is not a cross-process distributed transaction. Concurrent modifications to
the same path are serialized by path locks: the browser backend uses Web Locks
(effective across tabs in the same origin), and the desktop backend uses
host-arbitrated locks (effective across windows). Across **application
instances** (separate processes, each with its own host) there is still no protection.

## Relationship to database backups

Database backups (the `adapter.backup()` and restore of
[US-217](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/adapter/US-217-local-database-backup-restore.md))
**do not include the file bodies stored by this plugin**: the archive holds only
the database, and the result and manifest `scope` are always
`{ database: 'included', externalFiles: 'excluded' }`. Restoring an archive
brings back only file metadata; file bodies must be backed up and restored
separately — under the OPFS `rootDir` for the browser backend, and under the
file host root directory (`userData/rxdb-files` for the sample app) for the
desktop backend. When only the database is restored, the file bodies pointed to
by the metadata do not exist in the new location.

The desktop backend statement that it "shares one backup domain with the
desktop SQLite database" means both live in the application data directory and
can be handled together — not that a database archive carries the files along.

## Relationship to branches, commits, and restore

Files **do not travel with versions**. `StorageFileMeta` declares `log: false`,
so its writes produce no change log, and therefore:

- Switching branches does not touch it; every branch sees the same metadata and the same file contents;
- Undo / redo does not roll files back;
- With the working tree plugin installed, file additions, changes, and deletions
  never enter `status()` / `diff()` / `commit()`, and `restore()` does not bring
  files back to an older version;
- Overwrite writes and deletions take effect at once for every branch and every
  historical commit whose rows reference this file.

Attachments that need to travel back with versions should be used in the
application layer in an **immutable** way: new content goes to a new path, never
overwriting or deleting, and business rows store only the path or the file id.
Rows in historical commits and other branches then still reference the content
as it was at that time.

## Development commands

```bash
pnpm nx run rxdb-plugin-storage:typecheck
pnpm nx run rxdb-plugin-storage:lint --max-warnings=0
pnpm nx test rxdb-plugin-storage --run --browser.enabled=false --coverage.enabled=false
pnpm nx run rxdb-plugin-storage:test-browser --run --coverage.enabled=false
pnpm nx run rxdb-plugin-storage:build
```

## Fileoverview

RxDB Storage plugin
File storage plugin, providing file storage capabilities based on the Origin Private File System (OPFS)

Main features:
- File upload and download (upload/download)
- File preview and object URLs (preview/createObjectUrl)
- File and directory management (list/createDirectory/rename/delete)
- File metadata management (the StorageFileMeta entity)

## Classes

| Class | Description |
| ------ | ------ |
| [ObjectUrlRegistry](classes/ObjectUrlRegistry.md) | Uniformly manages object URL creation and revocation. |
| [OpfsStorageFilesystem](classes/OpfsStorageFilesystem.md) | The default backend that writes file contents into the browser's OPFS. |
| [RxdbFileStorage](classes/RxdbFileStorage.md) | The file storage service that saves files via [StorageFilesystem](interfaces/StorageFilesystem.md) and metadata via RxDB. |
| [RxDBPluginStorage](classes/RxDBPluginStorage.md) | The plugin lifecycle object that installs [RxdbFileStorage](classes/RxdbFileStorage.md) into a single RxDB instance. |
| [StorageBackendError](classes/StorageBackendError.md) | Failures on the file backend or desktop host side. |
| [StorageConflictError](classes/StorageConflictError.md) | Thrown when a write operation hits an existing target and overwrite was not allowed. |
| [StorageDestroyedError](classes/StorageDestroyedError.md) | Thrown when a public API is called after the storage service has entered its destroy flow. |
| [StorageFetchError](classes/StorageFetchError.md) | Thrown when a remote request was delivered successfully but returned a non-2xx status. |
| [StorageFetchUrlConflictError](classes/StorageFetchUrlConflictError.md) | A fetch **pointing to a different URL** is already in progress for the same `opfsPath`. |
| [StorageFileMeta](classes/StorageFileMeta.md) | The persisted metadata entity corresponding to an OPFS file. |
| [StorageInvalidPathError](classes/StorageInvalidPathError.md) | Thrown when the path is not a legal target for this operation. |
| [StorageMimeTypeMissingError](classes/StorageMimeTypeMissingError.md) | Thrown when the HTTP response succeeded but neither `options.mimeType` nor a `Content-Type` response header was provided. |
| [StorageOfflineError](classes/StorageOfflineError.md) | Thrown when a remote resource is unreachable. |
| [StoragePreviewLimitError](classes/StoragePreviewLimitError.md) | Thrown when a file exceeds the preview byte limit. |
| [StorageUnavailableError](classes/StorageUnavailableError.md) | Thrown when the current environment or RxDB configuration cannot provide the storage dependencies. |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [CreateDirectoryOptions](interfaces/CreateDirectoryOptions.md) | Directory creation options. |
| [DownloadOptions](interfaces/DownloadOptions.md) | File download options. |
| [FetchRemoteOptions](interfaces/FetchRemoteOptions.md) | Remote fetch options. |
| [ListOptions](interfaces/ListOptions.md) | Metadata list query options. |
| [RenameOptions](interfaces/RenameOptions.md) | File or directory rename options. |
| [RxDBStoragePluginOptions](interfaces/RxDBStoragePluginOptions.md) | Storage plugin installation options. |
| [StorageDirectoryEntry](interfaces/StorageDirectoryEntry.md) | The subdirectory entry returned when browsing a directory. |
| [StorageFileEntry](interfaces/StorageFileEntry.md) | The file entry returned when browsing a directory. |
| [StorageFilesystem](interfaces/StorageFilesystem.md) | The minimal set of filesystem capabilities the storage plugin depends on. |
| [StorageFilesystemContext](interfaces/StorageFilesystemContext.md) | Host information visible when creating a backend instance. |
| [StorageFilesystemEntry](interfaces/StorageFilesystemEntry.md) | A directory entry: exposes only the name and type the service layer needs, leaking no underlying handle. |
| [StorageFileWriter](interfaces/StorageFileWriter.md) | The write handle for a single file. |
| [StoragePreviewResult](interfaces/StoragePreviewResult.md) | A file preview result that can be explicitly disposed. |
| [UploadOptions](interfaces/UploadOptions.md) | File upload options. |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [StorageBackendErrorCode](type-aliases/StorageBackendErrorCode.md) | The stable discriminator code for backend (including desktop host) failures. |
| [StorageBrowserEntry](type-aliases/StorageBrowserEntry.md) | The directory or file entries returned by [RxdbFileStorage.listEntries](classes/RxdbFileStorage.md#listentries). |
| [StorageFilesystemFactory](type-aliases/StorageFilesystemFactory.md) | The factory that creates a backend instance for a storage root directory. |

## Variables

| Variable | Description |
| ------ | ------ |
| [createOpfsStorageFilesystem](variables/createOpfsStorageFilesystem.md) | Creates the OPFS backend; this is the storage plugin's default [StorageFilesystemFactory](type-aliases/StorageFilesystemFactory.md). |
| [rxDBPluginStorage](variables/rxDBPluginStorage.md) | The RxDB Storage plugin factory. |
| [rxdbStorage](variables/rxdbStorage.md) | The compatibility alias of [rxDBPluginStorage](variables/rxDBPluginStorage.md). |

## Functions

| Function | Description |
| ------ | ------ |
| [getDirectoryPathFromOpfsPath](functions/getDirectoryPathFromOpfsPath.md) | Returns the storage absolute directory containing an OPFS-relative path. |
| [getFileNameFromOpfsPath](functions/getFileNameFromOpfsPath.md) | Returns the last path segment of an OPFS-relative path. |
| [isOpfsPathInDirectory](functions/isOpfsPathInDirectory.md) | Checks whether a file belongs directly to a directory. |
| [isOpfsPathInsideDirectory](functions/isOpfsPathInsideDirectory.md) | Checks whether a file lies in a directory or any of its subdirectories. |
| [isStorageNotFoundError](functions/isStorageNotFoundError.md) | Checks whether an error means "target not found". |
| [joinDirectoryAndFileName](functions/joinDirectoryAndFileName.md) | Joins a storage directory and a file name, returning the OPFS-relative path. |
| [joinDirectoryPath](functions/joinDirectoryPath.md) | Joins a parent directory and a subdirectory name, returning the storage absolute path. |
| [normalizeDirectoryPath](functions/normalizeDirectoryPath.md) | Normalizes a directory path to the form starting with `/` and without a trailing `/`. |
| [normalizeRelativeOpfsPath](functions/normalizeRelativeOpfsPath.md) | Normalizes a storage path to an OPFS-relative path without a leading `/`. |
| [toAbsoluteStoragePath](functions/toAbsoluteStoragePath.md) | Converts an OPFS-relative path into a storage absolute path starting with `/`. |
