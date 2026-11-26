# createSqliteClient()

```ts
function createSqliteClient(
   dbName, 
   options, 
   owner?
): Promise<SqliteClientLike>;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/create\_sqlite\_client.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/create_sqlite_client.ts#L46)

Create and initialize the sqlite-wasm client.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `dbName` | `string` | Database name |
| `options` | [`SqliteOptions`](../interfaces/SqliteOptions.md) | Adapter configuration |
| `owner?` | `string` | Owner key: when a client is shared on a SharedWorker, disconnect uses it to return only its own share (`release`) |

## Returns

`Promise`&lt;[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md)&gt;

The main-thread client, or a remote proxy of the client on the Worker / SharedWorker
