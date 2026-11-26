# wrapWithComlinkEndpoint()

```ts
function wrapWithComlinkEndpoint<T>(directClient, options): Promise<T | Remote<T>>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/create\_sqlite\_client.ts:159](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts#L159)

Creates an independent Comlink sub-port for one client connection.

## Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`SqliteClientLike`](../interfaces/SqliteClientLike.md) |

## Parameters

| Parameter      | Type                                                                      | Description                                                                     |
| -------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `directClient` | `T`                                                                       | The main-thread client instance, returned as-is when no transport is configured |
| `options`      | [`CreateSqliteClientOptions`](../interfaces/CreateSqliteClientOptions.md) | The transport and ownership configuration                                       |

## Returns

`Promise`&lt;`T` \| `Remote`&lt;`T`&gt;&gt;

The main-thread client or the Comlink remote proxy on an independent sub-port

## Remarks

Calling `wrap()` directly on the Worker yields the root proxy; releasing it makes the Worker-side `expose()`
permanently remove the message listener, and the same Worker cannot reconnect afterwards. Here the root control proxy is cached, and only
`createEndpoint` is used to create an independently releasable MessagePort for each connection. Inside the Worker the existing
`expose(new SqliteClient())` can continue to be used; no switch of the public protocol is needed.

The same Worker exposes the same client instance; concurrent leasing is not allowed. Reconnection is only possible after the previous connection is released.
