# @aiao/rxdb-plugin-storage

`@aiao/rxdb-plugin-storage` brings file management to the browser: file contents live in [OPFS (Origin Private File System)](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system), while RxDB manages file metadata (name, size, type, path, and so on).

## Installation

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-plugin-storage
```

## Core concepts

### The file storage layer

- **OPFS**: stores file binary content — high-performance local reads and writes, fully private, never exposed to the user
- **RxDB (`StorageFileMeta`)**: stores file metadata — queryable, and changes are observable through `rxdb.storage.watch()`; it writes no change log and does not follow versions (see [Relationship with branches, commits, and restore](#relationship-with-branches-commits-and-restore))

### Plugin interface

The Storage plugin implements the `IRxDBPlugin` interface and registers through `rxdb.use()`; after installation, `rxdb.storage` is available.

## Basic usage

### Register the plugin

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { rxdbStorage } from '@aiao/rxdb-plugin-storage';

const rxdb = new RxDB({
  dbName: 'myapp',
  entities: [Todo],
  sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
});

rxdb.use(rxdbStorage);
await rxdb.connect('wa-sqlite');
await rxdb.storage.init();
```

### Configuration options

```typescript
rxdb.use(rxdbStorage, {
  rootDir: 'uploads', // OPFS root directory, default 'files'
  previewLimitBytes: 10 * 1024 * 1024 // preview size limit, default 50MB
});
```

## Desktop (native file system)

In desktop scenarios (US-504 Electron / US-505 Tauri), the plugin can write file contents into the host's **application data directory** (Electron main-process node:fs / Tauri Rust file host) instead of the WebView's OPFS — so the files themselves and the desktop SQLite database holding `StorageFileMeta` ([Electron adapter](../../adapters/electron.md) / [Tauri adapter](../../adapters/tauri.md)) land in the **same backup domain**: copying the application data directory backs up both metadata and file contents.

### Enable it

Import the factory from the `@aiao/rxdb-plugin-storage/desktop` subpath and inject it through the plugin option `filesystem`:

```typescript
import { rxdbStorage } from '@aiao/rxdb-plugin-storage';
import { createDesktopStorageFilesystem } from '@aiao/rxdb-plugin-storage/desktop';

rxdb.use(rxdbStorage, {
  rootDir: 'uploads',
  filesystem: createDesktopStorageFilesystem()
});
```

- On Electron, do **not** pass `transport`: it shares the same host channel the desktop adapter exposes through preload (`request` / `subscribe` of `__aiaoRxdbDesktopHost__`) and adds no new preload methods. On Tauri, pass your application's own transport (`createDesktopStorageFilesystem({ transport })`).
- `./desktop` is exported only through the subpath, **never re-exported from the main entry**: the main entry must be safe to bundle into a browser, while the desktop backend depends on the host transport layer.
- The factory validates the local adapter the moment it is called: when `sync.local.adapter` is not a desktop adapter (`sqlite-electron` / `sqlite-tauri`), it throws `StorageBackendError('adapter_mismatch', …)` and refuses to enable — **no fallback to OPFS**. The torn-backup-domain combination "files in a native directory, metadata in webview storage" is forbidden.
- Physical files live under a dedicated storage root inside the application data directory (on Tauri: `<appDataDir>/rxdb-files/`, sibling to SQLite's `rxdb-data/`).

### Differences from the browser OPFS tier

| Dimension        | Browser OPFS (default)        | Desktop native                                                                                                                     |
| ---------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Content target   | WebView's OPFS                | The storage root inside the application data directory                                                                             |
| Lock arbitration | Web Locks (same-origin lock)  | Host-side arbitration (works across windows; the backend provides `lockBackend`, and the constructor asserts it exists)            |
| Large files      | Streamed to disk              | Frame-chunked streaming (chunk size `DESKTOP_HOST_MAX_FILE_CHUNK_BYTES`), temp file + rename atomic replace, no half-written files |
| Paths            | Logical names usable directly | Deterministic logical→physical name encoding (NTFS reserved names / illegal characters); path escape is double-checked by the host |
| MIME             | Browser infers from extension | Native files have no MIME concept; `read()` re-attaches the type using the metadata's `mimeType` as authoritative                  |

The API surface is unchanged: **all** public methods of `RxdbFileStorage` (`upload` / `read` / `download` / `preview` / `list` / `listEntries` / `createDirectory` / `rename` / `renameDirectory` / `delete` / `clear` / `getMeta` / `watch`, and so on) work directly on the desktop backend with behavior identical to the OPFS backend.

## API

### Upload a file

```typescript
const file = new File(['Hello World'], 'hello.txt', { type: 'text/plain' });

// Upload to the root directory
const meta = await rxdb.storage.upload(file);

// Upload into a directory
const meta = await rxdb.storage.upload(file, { path: 'documents' });

// Overwrite an existing file
const meta = await rxdb.storage.upload(file, { overwrite: true });
```

### Read a file

```typescript
// Returns a Blob
const blob = await rxdb.storage.read(meta.id);
```

### Download a file

```typescript
// Trigger a browser download (prefers showSaveFilePicker, falls back to an <a> tag)
await rxdb.storage.download(meta.id);

// Set the downloaded file name
await rxdb.storage.download(meta.id, { suggestedName: 'custom-name.txt' });
```

### Preview a file

```typescript
// Create a preview (returns a temporary Object URL with a dispose method)
const preview = await rxdb.storage.preview(meta.id);
console.log(preview.url); // blob:http://...
console.log(preview.type); // 'text/plain'

// Release it when done
preview.dispose();
```

### Object URL management

```typescript
// Create an Object URL manually
const url = await rxdb.storage.createObjectUrl(meta.id);

// Release it manually when done
rxdb.storage.revokeObjectUrl(url);
```

### List files

```typescript
// Get all file metadata
const files = await rxdb.storage.list();

// List files directly under a directory (no subdirectories)
const files = await rxdb.storage.list({ path: '/documents' });
```

### Browse directory entries

```typescript
// List files and subdirectories inside a directory (tree browsing)
const entries = await rxdb.storage.listEntries({ path: '/' });

for (const entry of entries) {
  if (entry.kind === 'directory') {
    console.log('Directory:', entry.name, entry.path);
  } else {
    console.log('File:', entry.name, entry.meta.size);
  }
}
```

### Create a directory

```typescript
const dirPath = await rxdb.storage.createDirectory('images');
const nested = await rxdb.storage.createDirectory('2024', { path: '/images' });
```

### Rename

```typescript
// Rename a file
const updated = await rxdb.storage.rename(meta.id, 'new-name.txt');

// Rename a directory
const newPath = await rxdb.storage.renameDirectory('/images', 'photos');
```

### Delete a file

```typescript
await rxdb.storage.delete(meta.id);
```

### Clear storage

```typescript
// Clear all files
await rxdb.storage.clear();

// Clear all files under a directory
await rxdb.storage.clear('/documents');
```

### Get metadata

```typescript
const meta = await rxdb.storage.getMeta(fileId);
console.log(meta?.name, meta?.size, meta?.mimeType, meta?.opfsPath);
```

### Reactive watching

```typescript
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

rxdb.storage
  .watch(fileId)
  .pipe(takeUntilDestroyed())
  .subscribe(meta => {
    if (meta) {
      console.log('File updated:', meta.name, meta.size);
    } else {
      console.log('File deleted');
    }
  });
```

## The StorageFileMeta entity

File metadata lives in the `StorageFileMeta` entity with these fields:

| Field            | Type    | Description                                    |
| :--------------- | :------ | :--------------------------------------------- |
| `id`             | string  | Entity primary key (inherited from EntityBase) |
| `name`           | string  | File name                                      |
| `mimeType`       | string  | MIME type                                      |
| `size`           | number  | File size in bytes                             |
| `opfsPath`       | string  | Relative path inside OPFS (unique index)       |
| `contentVersion` | integer | Content version number, +1 on every write      |

## Relationship with branches, commits, and restore

Files **do not follow versions**. `StorageFileMeta` declares `log: false`, so its writes produce no change log entries, which means:

- Switching branches leaves it alone; every branch sees the same metadata and the same file contents;
- Undo / redo never rolls files back;
- With the working-tree plugin installed, file additions, edits, and deletions never enter `status()` / `diff()` / `commit()`, and `restore()` does not bring files back to an older version;
- Overwrites and deletes apply at once to all rows that reference the file in every branch and every historical commit;
- In a read-only checkout (the working-tree plugin's `checkouts`), `StorageFileMeta` is the metadata as of the moment it was opened, and does not follow the checked-out branch or commit; the file itself never enters the snapshot — reading by path returns the current content at read time. The UI should label this "not versioned".

For attachments that need to be versioned, use them at the application layer in an **immutable** way: write new content to a new path, never overwrite or delete, and let business rows store only the path or file id.
That way, rows in historical commits and other branches keep referencing the content as it was then.

## Path conventions

- The path separator is always `/`
- Directory path format: `/documents/2024`
- File path format: `documents/2024/report.pdf` (relative path, no leading `/`)
- Root directory: `/`

## Framework integration examples

### Angular

```typescript
import { useRxDB } from '@aiao/rxdb-angular';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  template: `
    <input (change)="upload($event)" type="file" />
    <p>File name: {{ meta()?.name }}</p>
  `
})
export class FileUploadComponent {
  private rxdb = useRxDB();
  meta = toSignal(this.rxdb.storage.watch(this.fileId));

  async upload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      await this.rxdb.storage.upload(file, { path: 'uploads' });
    }
  }
}
```

### React

```tsx
import { useRxDB } from '@aiao/rxdb-react';
import { useState } from 'react';

function FileUpload() {
  const rxdb = useRxDB();
  const [meta, setMeta] = useState(null);

  const upload = async event => {
    const file = event.target.files?.[0];
    if (file) {
      const result = await rxdb.storage.upload(file, { path: 'uploads' });
      setMeta(result);
    }
  };

  return (
    <div>
      <input type="file" onChange={upload} />
      {meta && <p>File name: {meta.name}</p>}
    </div>
  );
}
```

### Vue

```vue
<script setup>
import { useRxDB } from '@aiao/rxdb-vue';
import { ref } from 'vue';

const rxdb = useRxDB();
const meta = ref(null);

const upload = async event => {
  const file = event.target.files?.[0];
  if (file) {
    meta.value = await rxdb.storage.upload(file, { path: 'uploads' });
  }
};
</script>

<template>
  <input @change="upload" type="file" />
  <p v-if="meta">File name: {{ meta.name }}</p>
</template>
```

## Notes

- **Connect the local adapter first**: the Storage plugin depends on the `rxdb.config.sync.local` adapter (SQLite or PGlite); make sure to call `rxdb.connect('<local adapter name>')` first
- **Must call `init()`**: after registering the plugin, explicitly call `rxdb.storage.init()`; the `install()` method cannot be awaited
- **OPFS browser compatibility**: Chrome 86+, Safari 15.2+, Firefox 111+ support OPFS; OPFS data is only accessible on the same origin
- **Object URLs need manual release**: the URL returned by `createObjectUrl()` should be released with `revokeObjectUrl()` after use; the object returned by `preview()` provides a `dispose()` method
- **Preview size limit**: 50MB by default; larger previews throw, adjustable through the `previewLimitBytes` option
- **Metadata sync strategy**: the `StorageFileMeta` entity is automatically set to `SyncType.None` (local-only) and never syncs to a remote
