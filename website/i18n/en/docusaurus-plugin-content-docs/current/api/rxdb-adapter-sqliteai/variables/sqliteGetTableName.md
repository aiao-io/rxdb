# sqliteGetTableName

```ts
const sqliteGetTableName: (name, namespace) => string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/table-name-resolver.d.ts:13

Composes the physical name of the main table set: `<namespace>$<logical name>`.

## Parameters

| Parameter   | Type     | Description      |
| ----------- | -------- | ---------------- |
| `name`      | `string` | The logical name |
| `namespace` | `string` | The namespace    |

## Returns

`string`

The unquoted physical name

## Remarks

Only composes the string and judges no table set. Business entities always go
through [get\_table\_name\_by\_metadata](sqliteGetTableNameByMetadata.md); what
this gives is just the name in the main table set's convention.
