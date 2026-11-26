# sqliteGetTableName

```ts
const sqliteGetTableName: (name, namespace) => string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/table-name-resolver.d.ts:13

Compose the physical name of the primary table set: `<namespace>$<logical name>`.

## Parameters

| Parameter   | Type     | Description  |
| ----------- | -------- | ------------ |
| `name`      | `string` | Logical name |
| `namespace` | `string` | Namespace    |

## Returns

`string`

The unquoted physical name

## Remarks

Only composes the string and does not decide the table set. Business entities always go through [get\_table\_name\_by\_metadata](sqliteGetTableNameByMetadata.md);
what is given here is only the name of the primary table set.
