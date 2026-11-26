# SEARCH_BACKEND_DESCRIPTORS

```ts
const SEARCH_BACKEND_DESCRIPTORS: readonly SearchBackendDescriptor[];
```

Defined in: [packages/rxdb-plugin-search/src/backend/backend-registry.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/backend-registry.ts#L64)

All registry entries.

Within the SQLite family, `sqlite-wasm` / `sqlite` / `sqliteai` can be allowed because the custom function `rxdb_fts_bigram` that CJK indexing relies on is registered in the shared base class (`Oo1ClientBase` covers `sqlite` + `sqliteai`, `SqliteClient` covers `sqlite-wasm`), rather than each adapter writing its own. `wa-sqlite`'s registration function also lives in `WaSqliteClientBase`, but its npm precompiled wasm does not include the FTS5 module, so it is registered as `unverified` (see below).

Desktop hosts (`sqlite-electron` / `sqlite-tauri`) go through a cross-process protocol where SQL executes on the host side, and the host does not register this function — they are not in the registry, and this is exactly the reason given when they are rejected.
