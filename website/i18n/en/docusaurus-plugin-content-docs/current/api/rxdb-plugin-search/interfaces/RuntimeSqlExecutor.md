# RuntimeSqlExecutor

Defined in: [packages/rxdb-plugin-search/src/core/fts5-runtime.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/fts5-runtime.ts#L42)

Atomic SQL execution interface. Same shape as `RxDBAdapterSqliteBase.rawQuery` of `@aiao/rxdb-adapter-sqlite-core`.

## Methods

### rawQuery() \{#rawquery\}

```ts
rawQuery(sql, params?): Promise<{
  columns: string[];
  rows: unknown[][];
  rowsAffected: number;
}>;
```

Defined in: [packages/rxdb-plugin-search/src/core/fts5-runtime.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/fts5-runtime.ts#L43)

#### Parameters

| Parameter | Type                 |
| --------- | -------------------- |
| `sql`     | `string`             |
| `params?` | readonly `unknown`[] |

#### Returns

`Promise`&lt;\{
`columns`: `string`[];
`rows`: `unknown`[][];
`rowsAffected`: `number`;
\}&gt;
