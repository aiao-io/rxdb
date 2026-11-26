# createSqliteClient()

```ts
function createSqliteClient(dbName, options): Promise<SqliteClientLike>;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/create\_sqlite\_client.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/create_sqlite_client.ts#L26)

Creates a SqliteAI client instance and completes initialization.

If `options` specifies a worker / sharedWorker, it rents an independent
sub-port of the worker for this connection via `wrapWithComlinkEndpoint`;
otherwise it constructs directly on the main thread. After release, the same
worker can be connected again: restore first writes the database with one
connection, and the subsequent `connect()` opens another.

The return type is [SqliteClientLike](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md)
rather than the concrete `SqliteaiClient`: in worker mode what you get is a
Comlink remote proxy that promise-ifies every method, and asserting it as the
implementation class would make synchronous signatures like
`beginTransactionSql(): string` misreport in cross-thread mode (SQLC-040).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `dbName` | `string` | The database name (used for persisting file name normalization) |
| `options` | [`SqliteaiOptions`](../interfaces/SqliteaiOptions.md) | The SqliteAI adapter options (including OPFS / worker / cache size etc.) |

## Returns

`Promise`&lt;[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md)&gt;

The client whose `init` has completed and can execute SQL directly (a main-thread instance or its remote proxy)

## Throws

Thrown in worker / sharedWorker mode when function-typed options like `locateFile` / `print` / `printErr` are passed
