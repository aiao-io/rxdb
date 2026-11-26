# rxDBColumnTypeToPGliteTypeIndexName()

```ts
function rxDBColumnTypeToPGliteTypeIndexName(property): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.utils.ts:271](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.utils.ts#L271)

Gets the index operator class of a property
http://www.postgres.cn/docs/current/indexes-opclass.html

## Parameters

| Parameter | Type |
| ------ | ------ |
| `property` | [`EntityPropertyMetadata`](../../rxdb/type-aliases/EntityPropertyMetadata.md) |

## Returns

`string`
