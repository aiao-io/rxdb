# getTableColumnIndexName()

```ts
function getTableColumnIndexName(metadata, property, tableSet): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/table-name-resolver.ts:138](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/table-name-resolver.ts#L138)

Index name of a column (or relation column): `idx_<physical table name>_<property name>`, tied to the physical table name, so each table set naturally never collides.

## Parameters

| Parameter  | Type                                                                                                                                                              | Description                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md)                                                                                                     | Entity metadata               |
| `property` | \| [`EntityPropertyMetadata`](../../rxdb/type-aliases/EntityPropertyMetadata.md) \| [`EntityRelationMetadata`](../../rxdb/type-aliases/EntityRelationMetadata.md) | Property or relation metadata |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)                                                                                                      | Table set                     |

## Returns

`string`

The index name
