# generate_entity_inserts_sql()

```ts
function generate_entity_inserts_sql<T>(
  metadata,
  tableSet,
  entities,
  context?,
  encryption?
): Promise<{
  params: SQLiteCompatibleType[];
  sql: string;
}>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/entity/inserts\_sql.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/entity/inserts_sql.ts#L23)

Generates parameterized SQL for bulk-creating entities

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter     | Type                                                          |
| ------------- | ------------------------------------------------------------- |
| `metadata`    | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) |
| `tableSet`    | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)  |
| `entities`    | `InstanceType`&lt;`T`&gt;[]                                   |
| `context?`    | [`RxDBContext`](../../rxdb/interfaces/RxDBContext.md)         |
| `encryption?` | [`EncryptionContext`](../interfaces/EncryptionContext.md)     |

## Returns

`Promise`&lt;\{
`params`: [`SQLiteCompatibleType`](../type-aliases/SQLiteCompatibleType.md)[];
`sql`: `string`;
\}&gt;
