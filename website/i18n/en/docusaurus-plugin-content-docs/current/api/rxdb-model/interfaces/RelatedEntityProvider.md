# RelatedEntityProvider()

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L110)

Related entity data provider

## Remarks

Returns the list of selectable related entities by entity name (and optional namespace)

```ts
RelatedEntityProvider(entityName, namespace?): RelatedEntityItem[];
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L112)

Get the items of related entities that can be linked, by entity name (and optional namespace)

## Parameters

| Parameter    | Type     |
| ------------ | -------- |
| `entityName` | `string` |
| `namespace?` | `string` |

## Returns

[`RelatedEntityItem`](RelatedEntityItem.md)[]
