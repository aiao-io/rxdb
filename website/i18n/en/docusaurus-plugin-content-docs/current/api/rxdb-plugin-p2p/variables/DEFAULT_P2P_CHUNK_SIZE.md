# DEFAULT_P2P_CHUNK_SIZE

```ts
const DEFAULT_P2P_CHUNK_SIZE: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L39)

Defaults to 48 KiB: one chunk plus frame metadata fits into a single 64 KiB DataChannel message without fragmentation.
