# createTcpTransport()

```ts
function createTcpTransport(socket, options?): P2PByteTransport;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/tcp-transport.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/tcp-transport.ts#L101)

Desktop TCP/TLS adapter: 4-byte unsigned big-endian length prefix + frame, preventing packet coalescing/splitting.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `socket` | [`P2PTcpSocketLike`](../interfaces/P2PTcpSocketLike.md) |
| `options?` | \{ `requireEncryption?`: `boolean`; \} |
| `options.requireEncryption?` | `boolean` |

## Returns

[`P2PByteTransport`](../interfaces/P2PByteTransport.md)

## Remarks

A frame header larger than the protocol's maximum frame size is an immediate failure; when the write buffer is full it waits for `drain`. On failure or close it destroys the socket and stops buffering,
but keeps the `error` listener so that a late socket error does not become an unhandled exception.

## Throws

Error `requireEncryption` is on but the socket is not TLS
