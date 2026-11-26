# requiredQueryCacheColumns()

```ts
function requiredQueryCacheColumns(metadata): ReadonlyMap<string, string>;
```

Defined in: [packages/rxdb-adapter-pglite/src/query-cache/query\_cache\_row\_contract.ts:118](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/query-cache/query_cache_row_contract.ts#L118)

Computes the columns "a remote row must carry": those that are NOT NULL on the local table **and have no default value available at table creation time**.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |

## Returns

`ReadonlyMap`&lt;`string`, `string`&gt;

Property name (or relation name) → physical column name; carrying any one of them counts as carrying the full set

## Remarks

Each criterion is aligned one by one with `_create_table_column_sql` and `_create_table_relations_sql` in `table/create_table_sql.ts` — whatever is built there is judged here, **and both places must change together**.

Property columns:

- `nullable` true → the DDL has no `NOT NULL`, missing is fine;
- **`integer` primary key** → `serial PRIMARY KEY`; `serial` implies `nextval()`, omitted means auto-increment;
- **other primary keys (`uuid` / `string` / `bigint`) are still required**: the PG-side DDL only emits `"id" uuid PRIMARY KEY` and does not add `DEFAULT (lower(hex(randomblob(16))))` the way sqlite does; exempting them the sqlite way would let rows with a missing id reach PostgreSQL before failing. **This is the first divergence between the two backends.**
- literal `default` → goes into the DDL's `DEFAULT` clause (three exceptions, see hasUsableDefault).
  **Encrypted columns are a fourth exception, but still count as omittable**: their default value is plaintext and does not go into the DDL (see `create_table_sql`); the persistence path fills it in and wraps it into an envelope before encryption (`omittedEncryptedDefaults` in `upsert_many_sql.ts`).

Relation columns (only `ONE_TO_ONE` / `MANY_TO_ONE` occupy a physical column):

- `relation.nullable` → the DDL emits no `NOT NULL`, exempt;
- **`SET NULL` is not exempt**: `_create_table_relations_sql` only looks at `relation.nullable`; a non-nullable relation column still gets `NOT NULL` even with `ON DELETE SET NULL` (the sqlite side has `mustBeNullable` downgrading it to nullable). **This is the second divergence between the two backends**, and it is a known defect of this backend's table creation rather than a design difference — see the `@fileoverview` of this file.
- a literal `default` is exempt only for `MANY_TO_ONE` — the DDL's `DEFAULT` clause is embedded inside `kind === MANY_TO_ONE`; for `ONE_TO_ONE` not a single character of the default value makes it into the create statement.
