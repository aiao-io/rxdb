# sqliteGetTableNameByMetadata

```ts
const sqliteGetTableNameByMetadata: (metadata, tableSet) => string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/table-name-resolver.d.ts:28

Physical table name of an entity within a given table set.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | Table set |

## Returns

`string`

The unquoted physical table name
