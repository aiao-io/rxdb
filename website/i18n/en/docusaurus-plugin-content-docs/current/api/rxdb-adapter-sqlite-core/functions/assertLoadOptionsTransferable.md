# assertLoadOptionsTransferable()

```ts
function assertLoadOptionsTransferable(loadOptions, options): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/create\_sqlite\_client.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts#L97)

Asserts that load options about to be passed across a worker can be structured-cloned.

Comlink passes arguments via `postMessage`, and functions are not supported by the structured clone algorithm: stuffing
callbacks such as `locateFile` / `print` / `printErr` into `client.init(dbName, loadOptions)`
throws `DataCloneError` at the worker boundary, and the error stack gives no hint of which option caused it.

So it intercepts explicitly and names the option before crossing the thread — neither silently dropping the callback (which would make WASM location quietly take a wrong path),
nor degrading back to the main thread (which would fake the appearance of thread isolation).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `loadOptions` | `Readonly`&lt;`Record`&lt;`string`, `unknown`&gt;&gt; | The runtime options to be passed to `client.init` |
| `options` | [`CreateSqliteClientOptions`](../interfaces/CreateSqliteClientOptions.md) | The transport configuration, used to judge whether a worker is really crossed |

## Returns

`void`

## Throws

Throws [RxDBAdapterSqliteError](../classes/RxDBAdapterSqliteError.md) when function-typed options exist in worker / sharedWorker mode
