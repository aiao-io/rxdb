# getTableColumnIndexName()

```ts
function getTableColumnIndexName(metadata, property): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.utils.ts:297](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.utils.ts#L297)

Gets the table column index name

## Parameters

| Parameter  | Type                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md)                                                                                                     |
| `property` | \| [`EntityPropertyMetadata`](../../rxdb/type-aliases/EntityPropertyMetadata.md) \| [`EntityRelationMetadata`](../../rxdb/type-aliases/EntityRelationMetadata.md) |

## Returns

`string`
