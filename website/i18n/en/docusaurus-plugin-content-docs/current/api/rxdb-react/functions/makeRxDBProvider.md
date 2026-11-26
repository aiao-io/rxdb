# makeRxDBProvider()

```ts
function makeRxDBProvider<T>(): RxDBProviderSet<T>;
```

Defined in: [rxdb-react/src/rxdb-react.tsx:323](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/rxdb-react.tsx#L323)

Creates an isolated RxDB React context and access hook.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`RxDB`](../../rxdb/classes/RxDB.md) |

## Returns

[`RxDBProviderSet`](../interfaces/RxDBProviderSet.md)&lt;`T`&gt;

The Provider, `useRxDB`, `useRxDBOptional` and `useHasRxDBProvider` sharing the same context.
