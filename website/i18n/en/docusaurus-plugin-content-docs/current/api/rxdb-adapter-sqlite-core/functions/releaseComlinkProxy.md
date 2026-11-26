# releaseComlinkProxy()

```ts
function releaseComlinkProxy(client): boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/create\_sqlite\_client.ts:232](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts#L232)

Releases the MessagePort held by a Comlink proxy.

## Parameters

| Parameter | Type      | Description                                                                                                                   |
| --------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `client`  | `unknown` | Return value of [wrapWithComlink](wrapWithComlink.md) / [wrapWithComlinkEndpoint](wrapWithComlinkEndpoint.md), or `undefined` |

## Returns

`boolean`

Whether a remote proxy was really released

## Remarks

Every proxy from `wrap()` holds a MessageChannel, and callback parameters each create another one.
Without releasing, ports only grow across disconnect/reconnect cycles, and the Worker-side references stay alive too
(measured: remote methods remain callable after `disconnect()`).
A local client has no `releaseProxy`, so this is a no-op there — distinguished by the return value, not silently swallowing the difference.
