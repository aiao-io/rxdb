# MAX_P2P_CHUNK_SIZE

```ts
const MAX_P2P_CHUNK_SIZE: number = MAX_P2P_FRAME_PAYLOAD;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L42)

The largest chunk size a manifest allows, equal to the session frame payload limit; chunks larger than a single DataChannel message are sent fragmented by the transport layer.
