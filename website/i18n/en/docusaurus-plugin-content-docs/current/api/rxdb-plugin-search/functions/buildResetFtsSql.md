# buildResetFtsSql()

```ts
function buildResetFtsSql(plan): string;
```

Defined in: [packages/rxdb-plugin-search/src/core/fts5-runtime.ts:181](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/fts5-runtime.ts#L181)

**`Internal`**

FTS5 virtual table reset command: clears the index but keeps the table structure.

Must use `INSERT INTO <fts>(<fts>) VALUES('delete-all')` — FTS5 virtual tables do not support a plain `DELETE FROM <fts>` (it throws in external-content mode), and there is no UNIQUE constraint, so deduplication cannot rely on `INSERT OR IGNORE`.

## Parameters

| Parameter | Type                                                |
| --------- | --------------------------------------------------- |
| `plan`    | [`FtsInstallPlan`](../interfaces/FtsInstallPlan.md) |

## Returns

`string`
