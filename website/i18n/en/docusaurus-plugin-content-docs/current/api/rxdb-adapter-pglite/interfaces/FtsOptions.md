# FtsOptions

Defined in: [packages/rxdb-adapter-pglite/src/fts/types.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/fts/types.ts#L68)

FTS DDL generation options.

## Properties

### regconfig? \{#regconfig\}

```ts
readonly regconfig?: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/fts/types.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/fts/types.ts#L73)

PostgreSQL `regconfig` (determines the language behavior of `to_tsvector`).
Defaults to [DEFAULT\_FTS\_REGCONFIG](../variables/DEFAULT_FTS_REGCONFIG.md).

***

### schema? \{#schema\}

```ts
readonly schema?: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/fts/types.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/fts/types.ts#L85)

The schema the target table lives in (= the entity's `namespace`).

#### Remarks

The adapter creates entities as `"<namespace>"."<table>"` (see `getTableNameByMetadata`), so when the namespace is not `public` it **must** be passed: omitting it leaves the table reference unqualified and resolved by `search_path` — at best a 42P01 "table does not exist", at worst the DDL lands on another same-named table in public.

Omitting it is legal, with the semantics of "resolve by `search_path`", for tables the caller created itself and that really are on the default search path.
