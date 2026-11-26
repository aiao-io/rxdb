# buildOo1InitOptions()

```ts
function buildOo1InitOptions(options?): Record<string, unknown>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:240](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L240)

Constructs the Emscripten module initialization object from `Oo1LoadOptions` (fed to `sqlite3InitModule`).

Merges `printErr` / `print` / `locateFile`, using defaultPrintErr when absent.

## Parameters

| Parameter  | Type                                                | Description      |
| ---------- | --------------------------------------------------- | ---------------- |
| `options?` | [`Oo1LoadOptions`](../interfaces/Oo1LoadOptions.md) | The load options |

## Returns

`Record`&lt;`string`, `unknown`&gt;

A configuration object that can be passed directly to the sqlite3 module factory
