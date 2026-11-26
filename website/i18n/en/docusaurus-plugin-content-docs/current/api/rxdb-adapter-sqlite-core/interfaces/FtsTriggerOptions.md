# FtsTriggerOptions

Defined in: [packages/rxdb-adapter-sqlite-core/src/fts5/build-fts-triggers.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/fts5/build-fts-triggers.ts#L15)

Optional parameters of [buildFtsTriggersSql](../functions/buildFtsTriggersSql.md).

## Properties

### valueWrapper? \{#valuewrapper\}

```ts
readonly valueWrapper?: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/fts5/build-fts-triggers.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/fts5/build-fts-triggers.ts#L26)

The SQL function name applied before writing to the FTS index (e.g. `rxdb_fts_bigram`).

#### Remarks

By default nothing is applied, keeping behavior fully consistent with historical versions — other adapters do not need to register any custom function. Once specified, **backfill must apply the same function**, otherwise existing and incremental data would be tokenized inconsistently. The function only rewrites the text going into the index and never touches the source table; snippets are still cut from the source-table text by the query layer.

Must be a **bare SQL identifier** (`[A-Za-z_][A-Za-z0-9_]*`), otherwise it throws; see [buildFtsTriggersSql](../functions/buildFtsTriggersSql.md).
