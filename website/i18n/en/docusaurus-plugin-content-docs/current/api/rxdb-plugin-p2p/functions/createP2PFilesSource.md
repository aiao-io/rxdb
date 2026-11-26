# createP2PFilesSource()

```ts
function createP2PFilesSource(session, id): P2PChunkSource;
```

Defined in: [packages/rxdb-plugin-p2p/src/files-protocol.ts:114](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/files-protocol.ts#L114)

Adapts a session into the chunk source used by `transferP2PFile`.

## Parameters

| Parameter | Type                                                | Description                                                                                                          |
| --------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `session` | [`P2PPeerSession`](../interfaces/P2PPeerSession.md) | -                                                                                                                    |
| `id`      | `string`                                            | Identifier of the chunk source, used to isolate bad peers and report `sourcesUsed`, for example the peer's holder ID |

## Returns

[`P2PChunkSource`](../interfaces/P2PChunkSource.md)
