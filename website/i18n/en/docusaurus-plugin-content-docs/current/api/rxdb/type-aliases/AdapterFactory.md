# AdapterFactory

```ts
type AdapterFactory = (rxDB) => 
  | Promise<IRxDBAdapter>
  | IRxDBAdapter;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:1138](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L1138)

Adapter factory: this is what `RxDB.adapter()` registers, not an already-built adapter instance

## Parameters

| Parameter | Type |
| ------ | ------ |
| `rxDB` | [`RxDB`](../classes/RxDB.md) |

## Returns

  \| `Promise`&lt;[`IRxDBAdapter`](../interfaces/IRxDBAdapter.md)&gt;
  \| [`IRxDBAdapter`](../interfaces/IRxDBAdapter.md)

## Remarks

A factory rather than an instance is registered so that adapter construction is deferred to `RxDB.connect()` — building
an instance usually means opening files, requesting OPFS handles, and loading WASM, none of which should happen during
module evaluation.

The return value may be sync or a `Promise`, so adapters that need `await import()` to lazily load WASM and purely
synchronous adapters share one registration path.
