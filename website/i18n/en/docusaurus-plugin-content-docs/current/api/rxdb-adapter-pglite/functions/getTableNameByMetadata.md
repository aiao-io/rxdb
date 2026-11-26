# getTableNameByMetadata()

```ts
function getTableNameByMetadata(metadata, tableSet): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/table-name-resolver.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/table-name-resolver.ts#L103)

The fully qualified table name of an entity within a given table set.

## Parameters

| Parameter  | Type                                                          | Description     |
| ---------- | ------------------------------------------------------------- | --------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)  | Table set       |

## Returns

`string`

A double-quoted `"schema"."table"` string
