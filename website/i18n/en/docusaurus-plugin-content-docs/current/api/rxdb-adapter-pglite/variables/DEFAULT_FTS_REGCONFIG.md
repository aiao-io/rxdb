# DEFAULT_FTS_REGCONFIG

```ts
const DEFAULT_FTS_REGCONFIG: "simple" = 'simple';
```

Defined in: [packages/rxdb-adapter-pglite/src/fts/types.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/fts/types.ts#L61)

The default PostgreSQL `regconfig` for FTS, which determines the tokenizer / stopwords / stemmer.

`simple` does no stemming and is the safest for mixed-language content; for dedicated Chinese/English handling, override it at the call site (`buildCreateFtsTableSql(..., { regconfig: 'english' })`).
