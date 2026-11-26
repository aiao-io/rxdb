# LoadedSqlite

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts:299](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts#L299)

Return value of [waSqliteLoad](../functions/sqliteLoad.md): the initialized SQLite API and its registered VFS.

## Properties

### lockPolicy? \{#lockpolicy\}

```ts
lockPolicy?: string;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts:304](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts#L304)

The VFS's lock policy (e.g. `shared+hint`), letting the client decide whether to send `PRAGMA write_hint;` before BEGIN.

***

### sqlite3 \{#sqlite3\}

```ts
sqlite3: SQLiteAPI;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts:300](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts#L300)

***

### vfs \{#vfs\}

```ts
vfs: SQLiteVFS;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts:302](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts#L302)

The VFS instance registered via `sqlite3.vfs_register`; the caller is responsible for calling `close()` on disconnect to release the IndexedDB/OPFS handles.
