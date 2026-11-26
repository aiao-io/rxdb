# HttpPaginationFailure

```ts
type HttpPaginationFailure = 'shape_switch' | 'page_token_not_advancing' | 'empty_page_limit' | 'max_pages';
```

Defined in: [packages/rxdb-adapter-http/src/errors.ts:138](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/errors.ts#L138)

The four causes of pagination fail-fast (US-212 AC#7).
