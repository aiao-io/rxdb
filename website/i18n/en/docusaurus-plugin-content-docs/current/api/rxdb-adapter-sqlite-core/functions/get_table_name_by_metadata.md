# get_table_name_by_metadata()

```ts
function get_table_name_by_metadata(metadata, tableSet): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/table-name-resolver.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/table-name-resolver.ts#L76)

The physical table name of an entity within a given table set.

## Parameters

| Parameter  | Type                                                          | Description     |
| ---------- | ------------------------------------------------------------- | --------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)  | The table set   |

## Returns

`string`

The unquoted physical table name
