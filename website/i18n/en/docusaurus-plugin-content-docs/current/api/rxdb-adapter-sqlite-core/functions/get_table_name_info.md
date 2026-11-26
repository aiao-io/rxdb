# get_table_name_info()

```ts
function get_table_name_info(tableName): [string, string];
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/table-name-resolver.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/table-name-resolver.ts#L48)

Splits a physical name back into `[namespace, rest]`: cuts at the first `$`; without a `$` the namespace is the empty string.

## Parameters

| Parameter   | Type     | Description   |
| ----------- | -------- | ------------- |
| `tableName` | `string` | Physical name |

## Returns

\[`string`, `string`\]

`[namespace, rest]`
