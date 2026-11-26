# createSqliteClient()

```ts
function createSqliteClient(dbName, options): Promise<SqliteClientLike>;
```

Defined in: [packages/rxdb-adapter-sqlite/src/create\_sqlite\_client.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite/src/create_sqlite_client.ts#L26)

Creates and initializes the official sqlite-wasm client.

## Parameters

| Parameter | Type                                                              | Description                                  |
| --------- | ----------------------------------------------------------------- | -------------------------------------------- |
| `dbName`  | `string`                                                          | Database name                                |
| `options` | [`SqliteOfficialOptions`](../interfaces/SqliteOfficialOptions.md) | Options for the official sqlite-wasm adapter |

## Returns

`Promise`&lt;[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md)&gt;

The client after `init` completes (the main-thread instance or its remote proxy)

## Remarks

The return type is [SqliteClientLike](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md) rather than the concrete `SqliteClient`:
with worker / sharedWorker configured you get a Comlink remote proxy whose every method is Promisified,
and declaring it as `SqliteClient` would make synchronous signatures like
`beginTransactionSql(): string` lie in cross-thread mode (SQLC-040).

Each connection leases an independent child port of the Worker; after release the same Worker can be connected again: restore first writes the database with one connection,
and the later `connect()` opens another.
