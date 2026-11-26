# sqliteGetTableNameByMetadata

```ts
const sqliteGetTableNameByMetadata: (metadata, tableSet) => string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/table-name-resolver.d.ts:28

The physical table name of an entity in a given table set.

## Parameters

| Parameter  | Type                                                          | Description         |
| ---------- | ------------------------------------------------------------- | ------------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | The entity metadata |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)  | The table set       |

## Returns

`string`

The unquoted physical table name
