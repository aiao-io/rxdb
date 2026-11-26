# isManifestOwnedBy()

```ts
function isManifestOwnedBy(manifest, principal): boolean;
```

Defined in: [packages/rxdb-plugin-p2p/src/manifest.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/manifest.ts#L139)

Checks whether the manifest is held by the given authenticated principal on the given device.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `manifest` | `Pick`&lt;[`P2PManifestRecord`](../interfaces/P2PManifestRecord.md), `"holderId"`&gt; |
| `principal` | [`P2PPrincipal`](../interfaces/P2PPrincipal.md) |

## Returns

`boolean`
