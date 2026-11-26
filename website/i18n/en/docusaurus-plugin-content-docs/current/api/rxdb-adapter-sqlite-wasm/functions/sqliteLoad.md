# sqliteLoad()

```ts
function sqliteLoad(dbName, options): Promise<SQLiteDBCore>;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/sqlite-load.utils.ts:208](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/sqlite-load.utils.ts#L208)

Load and initialize @subframe7536/sqlite-wasm

## Parameters

| Parameter | Type                |
| --------- | ------------------- |
| `dbName`  | `string`            |
| `options` | `LoadModuleOptions` |

## Returns

`Promise`&lt;`SQLiteDBCore`&gt;

Returns `SQLiteDBCore`, containing fields such as `sqlite`, `pointer` (db), and `vfs`

## Remarks

When `opfs` opening fails with `SQLITE_CANTOPEN`, it backs off and retries: during a full page refresh the previous page may still hold the synchronous access handle on the database file
(see [openOpfsWithRetry](../../rxdb-adapter-sqlite-core/functions/openOpfsWithRetry.md)). Every retry creates a new VFS and connection, and the failed attempt's handle is handed back first; configuration-type errors are thrown before opening and are not retried.
