# FtsExecutor

```ts
type FtsExecutor = (sql, params) => Promise<readonly RawFtsRow[]>;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-engine.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-engine.ts#L32)

SQL execution adapter: accepts parameterized SQL and returns FTS rows.

## Parameters

| Parameter | Type                 |
| --------- | -------------------- |
| `sql`     | `string`             |
| `params`  | readonly `unknown`[] |

## Returns

`Promise`&lt;readonly `RawFtsRow`[]&gt;
