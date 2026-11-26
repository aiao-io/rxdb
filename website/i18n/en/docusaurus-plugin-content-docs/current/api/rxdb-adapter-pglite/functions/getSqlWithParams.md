# getSqlWithParams()

```ts
function getSqlWithParams(sql, params?): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.utils.ts:573](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.utils.ts#L573)

Replaces PostgreSQL parameter placeholders ($1, $2, etc.) with actual values
Used for bulk operations where parameterized queries cannot be used

## Parameters

| Parameter | Type        | Default value |
| --------- | ----------- | ------------- |
| `sql`     | `string`    | `undefined`   |
| `params?` | `unknown`[] | `[]`          |

## Returns

`string`
