# resolvePGliteInitOptions()

```ts
function resolvePGliteInitOptions(
   dbName, 
   options, 
   serverExtensions?
): ResolvedPGliteClientOptions;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L69)

Normalizes [PGliteClientOptions](../interfaces/PGliteClientOptions.md) into a shape the PGlite constructor can consume directly.

- When `store: 'memory'`, no `dataDir` is set and `relaxedDurability` is enabled by default
- Otherwise `dataDir` defaults to `idb://<dbName>`
- The `live` extension is injected unconditionally (a liveQuery dependency)
- Server extensions owned by the adapter are injected based on entity metadata (currently only `btree_gist`, required by range exclusion)

Publicly exported so unit tests and advanced users can precompute the config; normal usage never needs to call it directly.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `dbName` | `string` | `undefined` | Database name (used as the IndexedDB key) |
| `options` | [`PGliteClientOptions`](../interfaces/PGliteClientOptions.md) | `undefined` | Raw user options |
| `serverExtensions?` | [`PGliteServerExtensionRequirements`](../interfaces/PGliteServerExtensionRequirements.md) | `NO_PGLITE_SERVER_EXTENSIONS` | Server extensions the adapter loads based on entity metadata; see `pglite-server-extensions.ts` |

## Returns

`ResolvedPGliteClientOptions`

The normalized PGlite options
