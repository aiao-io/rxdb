# rxDBColumnTypeToPGliteType()

```ts
function rxDBColumnTypeToPGliteType(property): PGliteDataType;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.utils.ts:231](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.utils.ts#L231)

Converts an RxDB property type into a PGlite data type

Encrypted columns are always materialized as `text` regardless of the declared `PropertyType` — what is persisted is the opaque envelope string.

## Parameters

| Parameter  | Type                                                                          |
| ---------- | ----------------------------------------------------------------------------- |
| `property` | [`EntityPropertyMetadata`](../../rxdb/type-aliases/EntityPropertyMetadata.md) |

## Returns

`PGliteDataType`
