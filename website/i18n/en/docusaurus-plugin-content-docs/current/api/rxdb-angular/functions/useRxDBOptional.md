# useRxDBOptional()

```ts
function useRxDBOptional(): RxDB | undefined;
```

Defined in: [rxdb-angular/src/rxdb.provider.ts:157](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/rxdb.provider.ts#L157)

Reads the RxDB instance from the current injector, returning `undefined` when it is not ready.

## Returns

[`RxDB`](../../rxdb/classes/RxDB.md) \| `undefined`

The ready RxDB instance; `undefined` when it is not ready yet or creation failed

## Remarks

The only difference from [useRxDB](useRxDB.md) is "what to do when absent": this one does not throw, and is used for rendering loading states under an async source. Without [provideRxDB](provideRxDB.md) it also returns `undefined` instead of throwing. Must be called in an injection context.
