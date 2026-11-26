# P2PContentLookup

```ts
type P2PContentLookup = (contentHash) => P2PLocalContent | undefined | Promise<P2PLocalContent | undefined>;
```

Defined in: [packages/rxdb-plugin-p2p/src/files-protocol.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/files-protocol.ts#L25)

Looks up the local file held for a content hash; returns undefined when absent.

## Parameters

| Parameter     | Type     |
| ------------- | -------- |
| `contentHash` | `string` |

## Returns

\| [`P2PLocalContent`](../interfaces/P2PLocalContent.md)
\| `undefined`
\| `Promise`&lt;[`P2PLocalContent`](../interfaces/P2PLocalContent.md) \| `undefined`&gt;
