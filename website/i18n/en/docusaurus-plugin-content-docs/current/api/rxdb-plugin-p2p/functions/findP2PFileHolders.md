# findP2PFileHolders()

```ts
function findP2PFileHolders(records, contentHash): readonly P2PManifestRecord[];
```

Defined in: [packages/rxdb-plugin-p2p/src/manifest.ts:149](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/manifest.ts#L149)

Extracts the holder records of a content from sync results.

## Parameters

| Parameter     | Type                                                                 |
| ------------- | -------------------------------------------------------------------- |
| `records`     | readonly [`P2PManifestRecord`](../interfaces/P2PManifestRecord.md)[] |
| `contentHash` | `string`                                                             |

## Returns

readonly [`P2PManifestRecord`](../interfaces/P2PManifestRecord.md)[]

## Remarks

Structurally malformed rows are skipped; only the row with the latest `updatedAt` is kept per holder, and the result is ordered by `updatedAt` descending.
Records do not expire with time, and remote timestamps are never compared against the local clock — whether a device is online is answered by connection probing.
