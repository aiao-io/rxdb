# SearchBackendId

```ts
type SearchBackendId = 'fts5' | 'pg-tsvector';
```

Defined in: [packages/rxdb-plugin-search/src/backend/search-backend.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/search-backend.ts#L27)

Identifiers of the implemented search backends.

- `fts5` — SQLite FTS5 external-content virtual tables (the `@aiao/rxdb-adapter-sqlite-core` family)
- `pg-tsvector` — PostgreSQL materialized `tsvector` columns + GIN indexes (`@aiao/rxdb-adapter-pglite`)
