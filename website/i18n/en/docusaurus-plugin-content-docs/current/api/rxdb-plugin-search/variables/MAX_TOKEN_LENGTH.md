# MAX_TOKEN_LENGTH

```ts
const MAX_TOKEN_LENGTH: 256 = 256;
```

Defined in: [packages/rxdb-plugin-search/src/core/query-compiler.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/query-compiler.ts#L25)

Maximum UTF-16 code units per token, to prevent overly long phrases from overwhelming the FTS tokenizer.
