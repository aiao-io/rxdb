# wrapWithComlink()

```ts
function wrapWithComlink<T>(directClient, options): T | Remote<T>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/create\_sqlite\_client.ts:129](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts#L129)

When Worker/SharedWorker options are provided, wraps the client with Comlink; otherwise returns the direct client.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`SqliteClientLike`](../interfaces/SqliteClientLike.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `directClient` | `T` | The main-thread client instance, returned as-is when no transport is configured |
| `options` | [`CreateSqliteClientOptions`](../interfaces/CreateSqliteClientOptions.md) | The transport configuration |

## Returns

`T` \| `Remote`&lt;`T`&gt;

The main-thread client or its Comlink remote proxy

## Remarks

The return type is a union rather than a bare `T`: Comlink gives back a Remote,
which promises the return value of every method and does **not** carry `T`'s private fields and synchronous return signatures.
Earlier code asserted the remote proxy as the local client type via `as unknown as T`,
so a synchronous signature like `beginTransactionSql(): string` was fake in worker mode
— the caller, per the type, did not await, and got a Promise instead of the SQL text.
Callers should treat the result as [SqliteClientLike](../interfaces/SqliteClientLike.md) (whose signatures are already relaxed for "the remote will promise"),
not as a concrete client implementation class.
