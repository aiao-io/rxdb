# withGlobalOo1LoadLock()

```ts
function withGlobalOo1LoadLock<T>(run): Promise<T>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:172](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L172)

Serializes one complete oo1 module load into a single global channel.

Callers should wrap the whole load at the outermost layer (including [withPatchedOpfsProxyWorker](withPatchedOpfsProxyWorker.md) and `withSqliteApiConfig`),
so that all steps that rewrite global state fall inside the lock, eliminating cross-instance concurrent overwrites.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type                       | Description                                  |
| --------- | -------------------------- | -------------------------------------------- |
| `run`     | () => `Promise`&lt;`T`&gt; | Async function that performs the actual load |

## Returns

`Promise`&lt;`T`&gt;

`run`'s return value
