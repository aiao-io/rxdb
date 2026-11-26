# SearchQueryLimitKind

```ts
type SearchQueryLimitKind = 'queryLength' | 'tokenCount' | 'tokenLength';
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:176](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L176)

The query compilation budget is exceeded; no SQL is executed, observable via
error$, and the caller can prompt the user to shorten the input.
