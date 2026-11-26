# SupportVFS

```ts
type SupportVFS = "memory" | "idb" | "idb-memory" | "opfs" | "fs-handle";
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts#L15)

Supported @subframe7536/sqlite-wasm storage presets

- `memory`: `MemoryVFS` + wa-sqlite.wasm, purely in-memory
- `idb`: `IDBBatchAtomicVFS` + wa-sqlite-async.wasm, IndexedDB persistence
- `idb-memory`: `IDBMirrorVFS` + wa-sqlite-async.wasm, memory + IndexedDB mirror
- `opfs`: `OPFSCoopSyncVFS` + wa-sqlite.wasm, OPFS (Worker required)
- `fs-handle`: `OPFSAnyContextVFS` + wa-sqlite-async.wasm, FileSystemDirectoryHandle
