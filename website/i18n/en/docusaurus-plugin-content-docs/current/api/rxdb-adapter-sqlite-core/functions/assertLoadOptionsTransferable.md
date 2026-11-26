# assertLoadOptionsTransferable()

```ts
function assertLoadOptionsTransferable(loadOptions, options): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/create\_sqlite\_client.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts#L97)

Asserts that load options about to be passed across a worker can be structurally cloned.

Comlink passes arguments via `postMessage`, and functions are outside the structured clone algorithm's support: putting
callbacks like `locateFile` / `print` / `printErr` into `client.init(dbName, loadOptions)`
throws `DataCloneError` at the worker boundary, and the error stack gives no clue which option caused it.

So it intercepts explicitly before crossing the thread boundary and names the option — neither silently dropping the callback (which would quietly send WASM localization down the wrong path),
nor degrading back to the main thread (which would fake the appearance of thread isolation).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `loadOptions` | `Readonly`&lt;`Record`&lt;`string`, `unknown`&gt;&gt; | Runtime options to be passed to `client.init` |
| `options` | [`CreateSqliteClientOptions`](../interfaces/CreateSqliteClientOptions.md) | Transport configuration, used to decide whether it really crosses a worker |

## Returns

`void`

## Throws

Throws [RxDBAdapterSqliteError](../classes/RxDBAdapterSqliteError.md) when function-typed options exist in worker / sharedWorker mode
