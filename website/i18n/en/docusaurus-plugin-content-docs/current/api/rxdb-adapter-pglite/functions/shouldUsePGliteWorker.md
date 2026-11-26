# shouldUsePGliteWorker()

```ts
function shouldUsePGliteWorker(options): boolean;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L100)

Decides whether a Web Worker needs to be enabled for PGlite.

Returns `true` if and only if `dataDir` starts with `opfs-ahp://`: the OPFS-AHP backend must run inside a Worker (Synchronous Access Handles require leaving the main thread); other backends (memory, idb) can run on the main thread.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | `Pick`&lt;`ResolvedPGliteClientOptions`, `"dataDir"`&gt; | Options containing at least `dataDir` |

## Returns

`boolean`

Whether a Worker is needed
