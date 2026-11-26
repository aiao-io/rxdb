# get_sql_value()

```ts
function get_sql_value(value): 
  | string
  | number
  | bigint
  | boolean
  | number[]
  | Date
  | Uint8Array<ArrayBufferLike>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:565](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts#L565)

Gets the SQL value representation.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value to convert |

## Returns

  \| `string`
  \| `number`
  \| `bigint`
  \| `boolean`
  \| `number`[]
  \| `Date`
  \| `Uint8Array`&lt;`ArrayBufferLike`&gt;

The SQL literal string; strings containing NUL return an equivalent `char(0)` concatenation expression
