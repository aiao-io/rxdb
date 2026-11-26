# toRxDBManifestDocument()

```ts
function toRxDBManifestDocument(record): Record<string, unknown>;
```

Defined in: [packages/rxdb-plugin-p2p/src/discovery.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/discovery.ts#L93)

Maps a wire manifest onto an RxDB entity row.

`EntityBase.updatedAt` is a Date; the transport protocol's updatedAt is epoch milliseconds.
The two shapes must be converted explicitly, avoiding putting a number straight into the entity's date field.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `record` | [`P2PManifestRecord`](../interfaces/P2PManifestRecord.md) |

## Returns

`Record`&lt;`string`, `unknown`&gt;
