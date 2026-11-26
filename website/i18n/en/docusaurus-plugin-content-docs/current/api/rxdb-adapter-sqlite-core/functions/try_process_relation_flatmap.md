# try_process_relation_flatmap()

```ts
function try_process_relation_flatmap(adapter, context, entityMetadata, strValue, parts): boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/join\_sql.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/join_sql.ts#L86)

Handles keyValue fields on relations.

## Parameters

| Parameter        | Type                                                           |
| ---------------- | -------------------------------------------------------------- |
| `adapter`        | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md) |
| `context`        | [`JoinContext`](../interfaces/JoinContext.md)                  |
| `entityMetadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md)  |
| `strValue`       | `string`                                                       |
| `parts`          | `string`[]                                                     |

## Returns

`boolean`

## Remarks

**Known limitation**: the current implementation assumes dots are used only as nested path separators. If a key inside the keyValue object itself contains a dot, this method will not work correctly. See the documentation of `_try_process_top_level_flatmap` in query_sql.ts for details.
