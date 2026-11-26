# releaseComlinkProxy()

```ts
function releaseComlinkProxy(client): boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/create\_sqlite\_client.ts:232](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts#L232)

Releases the MessagePort held by a Comlink proxy.

## Parameters

| Parameter | Type      | Description                                                                                                                       |
| --------- | --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `client`  | `unknown` | The return value of [wrapWithComlink](wrapWithComlink.md) / [wrapWithComlinkEndpoint](wrapWithComlinkEndpoint.md), or `undefined` |

## Returns

`boolean`

Whether a remote proxy was actually released

## Remarks

Every proxy produced by `wrap()` holds a MessageChannel, and callback arguments each create another one.
Without releasing, ports only grow across disconnect/reconnect cycles, and references on the Worker side stay alive
(measured: remote methods are still callable after `disconnect()`).
A local client has no `releaseProxy`, in which case this is a no-op — distinguished by the return value rather than silently swallowing the difference.
