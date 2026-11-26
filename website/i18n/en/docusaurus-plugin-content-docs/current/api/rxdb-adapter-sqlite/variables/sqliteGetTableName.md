# sqliteGetTableName

```ts
const sqliteGetTableName: (name, namespace) => string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/table-name-resolver.d.ts:13

Builds the physical name of a main table set: `<namespace>$<logical name>`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | `string` | Logical name |
| `namespace` | `string` | Namespace |

## Returns

`string`

The unquoted physical name

## Remarks

Only concatenates the string, does not determine the table set. Business entities always go through [get\_table\_name\_by\_metadata](sqliteGetTableNameByMetadata.md);
what this gives is only the name for the main table set.
