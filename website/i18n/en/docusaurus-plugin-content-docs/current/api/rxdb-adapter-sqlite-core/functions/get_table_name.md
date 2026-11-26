# get_table_name()

```ts
function get_table_name(name, namespace): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/table-name-resolver.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/table-name-resolver.ts#L40)

Assembles the physical name of the main table set: `<namespace>$<logical name>`.

## Parameters

| Parameter   | Type     | Description      |
| ----------- | -------- | ---------------- |
| `name`      | `string` | The logical name |
| `namespace` | `string` | The namespace    |

## Returns

`string`

The unquoted physical name

## Remarks

Only assembles the string, does not judge the table set. Business entities always go through [get\_table\_name\_by\_metadata](get_table_name_by_metadata.md);
what is given here is only the name of the main table set.
