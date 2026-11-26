# build_order_by()

```ts
function build_order_by(orderBy?, metadata?, adapter?, fieldAliasMap?): string | undefined;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_sql.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_sql.ts#L72)

Builds ordering SQL

## Parameters

| Parameter        | Type                                                                                  | Description                                                    |
| ---------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `orderBy?`       | [`OrderBy`](../../rxdb/interfaces/OrderBy.md)&lt;`string`&gt;[]                       | Ordering conditions                                            |
| `metadata?`      | `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt; | Entity metadata                                                |
| `adapter?`       | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md)                        | The SQLite adapter instance                                    |
| `fieldAliasMap?` | `Map`&lt;`string`, `string`&gt;                                                       | Mapping from fields to JOIN aliases / json_extract expressions |

## Returns

`string` \| `undefined`

The SQL ordering clause

## Remarks

`fieldAliasMap` must come from `build_rule_group_join` (pass orderBy into it as well), otherwise relation paths and
keyValue paths get no alias: `resolve_column_name` only recognizes this table's propertyMap, so strings like `owner.name` are
pasted verbatim as a column name into `_."owner.name"`, and SQLite reports no such column directly (SQLC-025).
