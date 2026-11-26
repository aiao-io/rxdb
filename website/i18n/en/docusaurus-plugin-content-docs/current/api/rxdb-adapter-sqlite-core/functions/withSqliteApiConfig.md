# withSqliteApiConfig()

```ts
function withSqliteApiConfig<T>(config, run): Promise<T>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L66)

Temporarily sets `globalThis.sqlite3ApiConfig`, runs `run`, then restores the original value.

`@sqlite.org/sqlite-wasm` passes initialization configuration through a global variable;
this function guarantees that multiple concurrent loads do not overwrite each other's configuration.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `config` | `Record`&lt;`string`, `unknown`&gt; | Fields to merge into the existing configuration |
| `run` | () => `Promise`&lt;`T`&gt; | The async function executed while the configuration is in effect |

## Returns

`Promise`&lt;`T`&gt;

The return value of `run`
