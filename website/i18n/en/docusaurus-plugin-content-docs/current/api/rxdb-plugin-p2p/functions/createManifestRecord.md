# createManifestRecord()

```ts
function createManifestRecord(manifest, options): P2PManifestRecord;
```

Defined in: [packages/rxdb-plugin-p2p/src/manifest.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/manifest.ts#L112)

Generates a holder record from an authenticated identity; callers cannot claim another holderId.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `manifest` | [`P2PFileManifest`](../interfaces/P2PFileManifest.md) |
| `options` | \{ `now?`: `number`; `principal`: [`P2PPrincipal`](../interfaces/P2PPrincipal.md); \} |
| `options.now?` | `number` |
| `options.principal` | [`P2PPrincipal`](../interfaces/P2PPrincipal.md) |

## Returns

[`P2PManifestRecord`](../interfaces/P2PManifestRecord.md)

## Throws

RangeError `now` is not a non-negative safe integer

## Throws

TypeError The manifest does not satisfy the content-addressing rules
