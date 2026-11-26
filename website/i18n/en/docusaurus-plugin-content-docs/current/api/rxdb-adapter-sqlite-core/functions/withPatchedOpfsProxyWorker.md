# withPatchedOpfsProxyWorker()

```ts
function withPatchedOpfsProxyWorker<T>(options, run): Promise<T>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:189](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L189)

Temporarily replaces `globalThis.Worker` with a Proxy that rewrites the OPFS proxy worker script URL to `opfsProxyPath`.

Only takes effect when `options.opfs && options.opfsProxyPath` and the environment supports Worker; restores the original `Worker` constructor (including property descriptors) after `run` completes.

Concurrency safety: patching/restoring the global `Worker` is not reentrant; it must be serialized by the outer [withGlobalOo1LoadLock](withGlobalOo1LoadLock.md) (all load entry points already wrap it uniformly). Calling this concurrently outside that lock is still unsafe.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type                                                               | Description                                                              |
| --------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `options` | [`Oo1LoadOptions`](../interfaces/Oo1LoadOptions.md) \| `undefined` | Load options; passes through to `run` when opfs/opfsProxyPath is missing |
| `run`     | () => `Promise`&lt;`T`&gt;                                         | Async load function executed while Worker is patched                     |

## Returns

`Promise`&lt;`T`&gt;

The return value of `run`
