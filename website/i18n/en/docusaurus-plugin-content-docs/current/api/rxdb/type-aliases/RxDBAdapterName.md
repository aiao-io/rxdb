# RxDBAdapterName

```ts
type RxDBAdapterName = keyof RxDBAdapters | (string & object);
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:1173](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L1173)

Adapter name

## Remarks

The `(string & {})` branch lets any string through (adapters of unregistered types work fine), while keeping
autocompletion for the keys already registered in [RxDBAdapters](../interfaces/RxDBAdapters.md) — a plain `string` would
swallow autocompletion entirely.
