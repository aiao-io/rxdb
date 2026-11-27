# toSyncManifestDocument()

```ts
function toSyncManifestDocument(record): Record<string, unknown>;
```

Defined in: [packages/rxdb-plugin-p2p/src/discovery.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/discovery.ts#L75)

Converts a holder record into a sync document, explicitly declaring that it travels via sync rather than local storage.

## Parameters

| Parameter | Type                                                      |
| --------- | --------------------------------------------------------- |
| `record`  | [`P2PManifestRecord`](../interfaces/P2PManifestRecord.md) |

## Returns

`Record`&lt;`string`, `unknown`&gt;
