# INVALID_QUERY_ERROR_CODE

```ts
const INVALID_QUERY_ERROR_CODE: 'INVALID_QUERY';
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.utils.ts:128](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.utils.ts#L128)

Error code for query compilation failures: when `where` / `orderBy` cannot be translated into SQL.

## Remarks

The cause lies **only in the query supplied by the caller** — unknown fields, illegal operators, wrong value shapes, illegal ordering directions, etc. Upper layers (such as a server that fronts the adapter behind HTTP) use this to classify such cases as 4xx, while every other [RxdbAdapterPGliteError](../classes/RxdbAdapterPGliteError.md) is treated as a server-side failure: without this code, internal failures (`Unsupported repository type`, `DURABILITY_LOST`, etc.) would be misclassified wholesale as client errors.

Does not cover query value conversion failures for bigint / binary — that path throws `TypeError`, not this class of error.
