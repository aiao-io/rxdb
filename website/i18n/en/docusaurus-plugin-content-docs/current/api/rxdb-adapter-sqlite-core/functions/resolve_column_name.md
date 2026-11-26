# resolve_column_name()

```ts
function resolve_column_name(fieldName, entityMetadata?): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_sql.utils.ts:237](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts#L237)

Resolves a JS property name to a database column name.
When entityMetadata is present, columnName takes precedence.
Supports nested paths such as keyValue.string.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `fieldName` | `string` |
| `entityMetadata?` | `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt; |

## Returns

`string`
