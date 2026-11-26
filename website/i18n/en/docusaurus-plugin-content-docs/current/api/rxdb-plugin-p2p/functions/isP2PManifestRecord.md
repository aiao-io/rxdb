# isP2PManifestRecord()

```ts
function isP2PManifestRecord(value): value is P2PManifestRecord;
```

Defined in: [packages/rxdb-plugin-p2p/src/manifest.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/manifest.ts#L103)

Checks whether a synced row satisfies the manifest's content-addressing rules.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `unknown` |

## Returns

`value is P2PManifestRecord`

## Remarks

Synced rows may come from an older version or be tampered with; this check must pass before source selection, otherwise one malformed `chunkHashes`
row can make the whole file undownloadable.
