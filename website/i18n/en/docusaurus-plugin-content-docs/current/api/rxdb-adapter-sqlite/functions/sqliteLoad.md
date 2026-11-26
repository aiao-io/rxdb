# sqliteLoad()

```ts
function sqliteLoad(options?): Promise<Oo1Static>;
```

Defined in: [packages/rxdb-adapter-sqlite/src/sqlite-official-load.utils.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite/src/sqlite-official-load.utils.ts#L43)

Loads and caches the official sqlite-wasm oo1 module.

## Parameters

| Parameter  | Type                                                        | Description                                                   |
| ---------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| `options?` | [`SqliteLoadOptions`](../type-aliases/SqliteLoadOptions.md) | WASM resources, logging, OPFS, and client performance options |

## Returns

`Promise`&lt;[`Oo1Static`](../../rxdb-adapter-sqlite-core/interfaces/Oo1Static.md)&gt;

The oo1 module that passed runtime structure validation

## Remarks

Calls with the same resource-location configuration share the module; reinitializes when `wasmPath`, `opfsProxyPath`, or `locateFile` changes.
Browser OPFS mode requires cross-origin isolation. A passed-in worker URL is only temporarily rewritten during initialization.

## Throws

Throws when the upstream module structure is incompatible, WASM initialization fails, or the OPFS environment is unavailable
