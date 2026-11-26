# get_sql_with_params()

```ts
function get_sql_with_params(sql, params?): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:602](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts#L602)

Merges a SQL template and parameters into a complete SQL statement

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `sql` | `string` | `undefined` | The SQL template string |
| `params?` | readonly `unknown`[] | `[]` | The parameter array |

## Returns

`string`

The complete SQL string

## Throws

TypeError When a parameter contains a number array (no literal form to inline)
