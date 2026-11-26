# isAdapterShutdownError()

```ts
function isAdapterShutdownError(err): boolean;
```

Defined in: [packages/rxdb/src/rxdb-utils.ts:247](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-utils.ts#L247)

Judges whether an error was caused by the adapter being closed / disconnected.

During RxDB.disconnect, in-flight queries hit the already-disconnected adapter and throw immediately — expected behavior that normally should not be logged as an error. This function unifies the shutdown-error recognition of the underlying drivers (SQLite/PGlite/IndexedDB), shared by modules such as HistoryManager, RxDBAdapterPGlite, and RxDBPluginTrigger.

## Parameters

| Parameter | Type      |
| --------- | --------- |
| `err`     | `unknown` |

## Returns

`boolean`
