# get_table_name_by_entity_type()

```ts
function get_table_name_by_entity_type(EntityType, tableSet): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/table-name-resolver.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/table-name-resolver.ts#L101)

The physical table name of an entity in the given table set.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | [`EntityType`](../../rxdb/type-aliases/EntityType.md) | Entity type |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | Table set |

## Returns

`string`

The unquoted physical table name
