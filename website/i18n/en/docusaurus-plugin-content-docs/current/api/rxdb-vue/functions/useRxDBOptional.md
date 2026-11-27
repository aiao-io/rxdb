# useRxDBOptional()

```ts
function useRxDBOptional(): RxDB | undefined;
```

Defined in: [rxdb-vue/src/rxdb-vue.ts:249](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/rxdb-vue.ts#L249)

Gets the current ready RxDB instance, returning `undefined` when unavailable.

## Returns

[`RxDB`](../../rxdb/classes/RxDB.md) \| `undefined`

The ready instance; `undefined` when there is no provider or the database is not ready yet

## Remarks

The only difference from [useRxDB](useRxDB.md) is "what to do when absent": this one does not throw, and is used for rendering loading states under an async source. Semantics match [injectRxDB](../variables/injectRxDB.md), the only difference being that it does **not** emit Vue's injection warning when the provider is missing — an optional read may legitimately have no provider. The name is aligned with Angular / React's `useRxDBOptional`.
