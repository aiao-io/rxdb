# wrapWithComlink()

```ts
function wrapWithComlink<T>(directClient, options): T | Remote<T>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/create\_sqlite\_client.ts:129](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts#L129)

Wraps the client with Comlink when Worker/SharedWorker options are provided, otherwise returns the direct client.

## Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`SqliteClientLike`](../interfaces/SqliteClientLike.md) |

## Parameters

| Parameter      | Type                                                                      | Description                                                                 |
| -------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `directClient` | `T`                                                                       | Main-thread client instance; returned as-is when no transport is configured |
| `options`      | [`CreateSqliteClientOptions`](../interfaces/CreateSqliteClientOptions.md) | Transport configuration                                                     |

## Returns

`T` \| `Remote`&lt;`T`&gt;

The main-thread client or its Comlink remote proxy

## Remarks

The return type is a union rather than a bare `T`: Comlink gives back a Remote,
which promise-ifies the return value of every method and does **not** carry `T`'s private fields and synchronous return signatures.
Earlier the remote proxy was asserted to the local client type with `as unknown as T`,
so synchronous signatures like `beginTransactionSql(): string` were fake in worker mode
— callers following the type did not await, and got a Promise instead of SQL text.
Callers should treat the result as [SqliteClientLike](../interfaces/SqliteClientLike.md) (whose signatures have been relaxed for "the remote will promise-ify"),
rather than the concrete client implementation class.
