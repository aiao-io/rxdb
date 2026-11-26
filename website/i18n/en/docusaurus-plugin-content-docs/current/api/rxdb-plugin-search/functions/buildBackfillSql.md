# buildBackfillSql()

```ts
function buildBackfillSql(plan): string;
```

Defined in: [packages/rxdb-plugin-search/src/core/fts5-runtime.ts:187](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/fts5-runtime.ts#L187)

Backfill SQL: external-content FTS5 tables bind the primary key via rowid; stringArray fields go through a json_each subquery.

## Parameters

| Parameter | Type                                                |
| --------- | --------------------------------------------------- |
| `plan`    | [`FtsInstallPlan`](../interfaces/FtsInstallPlan.md) |

## Returns

`string`
