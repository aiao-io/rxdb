# sqliteaiLoad()

```ts
function sqliteaiLoad(options?): Promise<Oo1Static>;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/sqliteai-load.utils.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/sqliteai-load.utils.ts#L46)

Loads the SqliteAI WASM module (with module-level caching).

The first call downloads and initializes the WASM; later calls reuse the cached
`Oo1Static`. If a new call needs the OPFS proxy patch and the cached module
never enabled it, it reloads once to apply the patch.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`SqliteaiLoadOptions`](../type-aliases/SqliteaiLoadOptions.md) | The load options (including OPFS / wasmPath / printErr etc.) |

## Returns

`Promise`&lt;[`Oo1Static`](../../rxdb-adapter-sqlite-core/interfaces/Oo1Static.md)&gt;

The shared `Oo1Static` instance
