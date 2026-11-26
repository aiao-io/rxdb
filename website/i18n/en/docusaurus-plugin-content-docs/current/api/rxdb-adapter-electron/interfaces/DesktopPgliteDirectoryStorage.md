# DesktopPgliteDirectoryStorage

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-storage.d.ts:28

PGlite data directory desktop storage.

## Remarks

The field name is deliberately different from [DesktopSqliteFileStorage](DesktopSqliteFileStorage.md): a PGlite data directory is **a directory**
containing multiple files and must never be described or serialized as a single-file database. This shape **belongs to no existing adapter**:
the Tauri side will never support it (no Node main process can serve PGlite's synchronous filesystem contract),
and the Electron side has to wait for US-208 to stand up `pglite-electron`. Until then, handing it to the SQLite client
gets rejected by [assertDesktopSqliteStorage](../functions/assertDesktopSqliteStorage.md) with `unsupported_runtime_engine`.

## Properties

### dataDirectoryName \{#datadirectoryname\}

```ts
readonly dataDirectoryName: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-storage.d.ts:31

Logical data directory name within the app's scope.

---

### engine \{#engine\}

```ts
readonly engine: "pglite";
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-storage.d.ts:29
