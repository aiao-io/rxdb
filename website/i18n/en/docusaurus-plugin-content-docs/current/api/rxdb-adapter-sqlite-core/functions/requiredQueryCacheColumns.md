# requiredQueryCacheColumns()

```ts
function requiredQueryCacheColumns(metadata): ReadonlyMap<string, string>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query-cache-row-contract.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query-cache-row-contract.ts#L51)

Computes the columns that "remote rows must carry": those that are NOT NULL on the local table and **have no default value available at table creation time**.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |

## Returns

`ReadonlyMap`&lt;`string`, `string`&gt;

Property name (or relation name) → physical column name; a row carrying any one of them counts as complete

## Remarks

The criteria mirror `create_table_column_sql` in `create_table_sql.ts` clause by clause — however a column is created there, it is judged the same way here; both places must change together:

- `nullable` is true → created without `NOT NULL`, so missing is fine;
- uuid primary key → the DDL provides `DEFAULT (lower(hex(randomblob(16))))`;
- integer primary key → `PRIMARY KEY AUTOINCREMENT`, so omission auto-increments;
- literal `default` → goes into the DDL `DEFAULT` clause (except binary, which the DDL explicitly skips);
- **function `default`** → not a single character enters the DDL. `EntityBase.createdAt` with `default: () => new Date()` is exactly this branch: it is a **repository layer** thing, while QueryCache writes via raw SQL that bypasses the repository — so the column is created NOT NULL, the remote side does not carry it, and the INSERT is bound to be rejected.

Relation columns get two exemptions: `relation.nullable` / `SET NULL`; literal `default` is exempt only for `MANY_TO_ONE` — the DDL DEFAULT clause is emitted only for that kind, and `ONE_TO_ONE` defaults contribute not a single character to the create-table statement.
