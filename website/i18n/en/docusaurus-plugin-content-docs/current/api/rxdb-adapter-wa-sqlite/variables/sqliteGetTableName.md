# sqliteGetTableName

```ts
const sqliteGetTableName: (name, namespace) => string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/table-name-resolver.d.ts:13

Assembles the physical name of the main table set: `<namespace>$<logical name>`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | `string` | Logical name |
| `namespace` | `string` | Namespace |

## Returns

`string`

The unquoted physical name

## Remarks

Only assembles the string; does not judge the table set. Business entities always go through [get\_table\_name\_by\_metadata](sqliteGetTableNameByMetadata.md);
what is returned here is only the main table set's name.
