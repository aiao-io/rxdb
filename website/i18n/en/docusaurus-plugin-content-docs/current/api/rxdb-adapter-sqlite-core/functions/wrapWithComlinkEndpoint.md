# wrapWithComlinkEndpoint()

```ts
function wrapWithComlinkEndpoint<T>(directClient, options): Promise<T | Remote<T>>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/create\_sqlite\_client.ts:159](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts#L159)

Creates an independent Comlink child port for one client connection.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`SqliteClientLike`](../interfaces/SqliteClientLike.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `directClient` | `T` | Main-thread client instance; returned as-is when no transport is configured |
| `options` | [`CreateSqliteClientOptions`](../interfaces/CreateSqliteClientOptions.md) | Transport and ownership configuration |

## Returns

`Promise`&lt;`T` \| `Remote`&lt;`T`&gt;&gt;

The main-thread client or a Comlink remote proxy on an independent child port

## Remarks

Calling `wrap()` directly on the Worker yields the root proxy; releasing it makes the Worker-side `expose()`
permanently remove the message listener, after which the same Worker cannot reconnect. Here the root control proxy is cached, and only
`createEndpoint` is used to create an independently releasable MessagePort for each connection. The Worker can keep using
the existing `expose(new SqliteClient())` without switching the public protocol.

The same Worker exposes the same client instance, so concurrent leasing is not allowed; a reconnect is only possible after the previous connection is released.
