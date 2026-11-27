# releaseComlinkProxy()

```ts
function releaseComlinkProxy(client): boolean;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/create\_sqlite\_client.d.ts:83

Release the MessagePort held by the Comlink proxy.

## Parameters

| Parameter | Type      | Description                                                                                                                                                                                                         |
| --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client`  | `unknown` | The return value of [wrapWithComlink](../../rxdb-adapter-sqlite-core/functions/wrapWithComlink.md) / [wrapWithComlinkEndpoint](../../rxdb-adapter-sqlite-core/functions/wrapWithComlinkEndpoint.md), or `undefined` |

## Returns

`boolean`

Whether a remote proxy was actually released

## Remarks

Every proxy produced by `wrap()` holds a MessageChannel, and callback arguments each create another one.
Without releasing, ports only grow across disconnect/reconnect cycles and references on the Worker side stay alive
(measured: remote methods are still callable after `disconnect()`).
Local clients have no `releaseProxy`; it is a no-op there — distinguished by the return value instead of silently swallowing the difference.
