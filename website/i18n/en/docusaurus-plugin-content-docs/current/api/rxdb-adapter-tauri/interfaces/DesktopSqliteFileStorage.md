# DesktopSqliteFileStorage

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-storage.d.ts:13

SQLite single-file desktop storage.

## Remarks

`databaseName` is a **logical name within the app scope**, not a filesystem path: the renderer has
no way to know, and no need to know, the physical root directory. The physical location is resolved
by the host inside its own app data directory (AC#3).

## Properties

### databaseName \{#databasename\}

```ts
readonly databaseName: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-storage.d.ts:16

Logical database name within the app scope, e.g. `app.sqlite3`.

---

### engine \{#engine\}

```ts
readonly engine: "sqlite";
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-storage.d.ts:14
