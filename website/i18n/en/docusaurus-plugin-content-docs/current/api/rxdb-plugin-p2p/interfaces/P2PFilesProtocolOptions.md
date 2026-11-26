# P2PFilesProtocolOptions

Defined in: [packages/rxdb-plugin-p2p/src/files-protocol.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/files-protocol.ts#L38)

Serving options for the files protocol; the local side serves chunks only when both are provided.

## Properties

### authorize? \{#authorize\}

```ts
readonly authorize?: (context) => void | Promise<void>;
```

Defined in: [packages/rxdb-plugin-p2p/src/files-protocol.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/files-protocol.ts#L42)

Validates this request before looking up or reading the local file; throwing rejects with `unauthorized`, and the error text is told to the peer as-is.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `context` | [`P2PFilesAuthorizeContext`](P2PFilesAuthorizeContext.md) |

#### Returns

`void` \| `Promise`&lt;`void`&gt;

***

### contents? \{#contents\}

```ts
readonly contents?: P2PContentLookup;
```

Defined in: [packages/rxdb-plugin-p2p/src/files-protocol.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/files-protocol.ts#L40)

The content table held by the local side.

***

### maxConcurrentRequests? \{#maxconcurrentrequests\}

```ts
readonly maxConcurrentRequests?: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/files-protocol.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/files-protocol.ts#L44)

Number of inbound requests reading the disk and sending simultaneously, 1-32, default 8.
