# createP2PFilesProtocol()

```ts
function createP2PFilesProtocol(options?): P2PProtocol;
```

Defined in: [packages/rxdb-plugin-p2p/src/files-protocol.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/files-protocol.ts#L89)

The files protocol: peers fetch chunks by the byte ranges of the requester's manifest; any number of files can be pulled over one session.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`P2PFilesProtocolOptions`](../interfaces/P2PFilesProtocolOptions.md) |

## Returns

[`P2PProtocol`](../interfaces/P2PProtocol.md)

## Remarks

Authorization first, then the content table: an unauthorized peer cannot learn whether the local side holds a content. When the local side does not hold the content it rejects with `not_holder`,
and the session remains available for other contents the peer does hold. After authorization and before reading the disk, the cancellation signal is checked once more; cancelled requests are not read from disk.
Without `contents` or `authorize` the local side does not serve chunks and only acts as a requester.
