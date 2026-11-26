# isSameOo1LoadConfig()

```ts
function isSameOo1LoadConfig(cached, requested): boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:301](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L301)

Whether two loads point to the same WASM module.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cached` | [`Oo1LoadFingerprint`](../interfaces/Oo1LoadFingerprint.md) | Fingerprint of the cached module |
| `requested` | [`Oo1LoadFingerprint`](../interfaces/Oo1LoadFingerprint.md) | Fingerprint of the current call |

## Returns

`boolean`

If equal, the cache can be reused; otherwise it must be reloaded

## Remarks

Fingerprint-based caching is chosen over "error on incompatibility" because **reloading is already existing behavior locked in by tests**: when the cached module was loaded without the OPFS proxy patch and a new call needs it, the original implementation reloads once. Including `wasmPath` / `opfsProxyPath` / `locateFile` in the fingerprint generalizes that existing rule to all fields that "decide what gets loaded", keeping the semantics consistent without breaking existing capability.
