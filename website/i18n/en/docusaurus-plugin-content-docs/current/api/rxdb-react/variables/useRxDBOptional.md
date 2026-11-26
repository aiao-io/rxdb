# useRxDBOptional

```ts
const useRxDBOptional: UseRxDBOptional<RxDB> = defaultProvider.useRxDBOptional;
```

Defined in: [rxdb-react/src/rxdb-react.tsx:384](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/rxdb-react.tsx#L384)

Reads the explicitly passed RxDB, or the nearest [RxDBProvider](RxDBProvider.md), returning `undefined` when unavailable.

## Param

**db**

Optional explicit database; reads the nearest Provider when omitted.

## Returns

The ready instance; `undefined` when there is no Provider or the database is not ready yet

## Remarks

The only difference from [useRxDB](useRxDB.md) is "what to do when absent": this one does not throw, and is used for rendering loading states under an async source. "No Provider" and "a Provider exists but is not ready" are both `undefined` here; pair with [useHasRxDBProvider](useHasRxDBProvider.md) to tell them apart.
