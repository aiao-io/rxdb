# getEntityColumnName()

```ts
function getEntityColumnName(metadata, field): string | undefined;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L72)

Converts an entity property name or relation ID name into a database column name.

## Parameters

| Parameter  | Type                                                  |
| ---------- | ----------------------------------------------------- |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) |
| `field`    | `string`                                              |

## Returns

`string` \| `undefined`
