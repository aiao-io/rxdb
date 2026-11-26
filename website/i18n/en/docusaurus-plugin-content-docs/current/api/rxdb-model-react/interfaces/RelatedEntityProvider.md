# RelatedEntityProvider()

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:99

Related entity data provider

## Remarks

Returns the optional related entity list from the entity name (and optional namespace)

```ts
RelatedEntityProvider(entityName, namespace?): RelatedEntityItem[];
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:101

Gets the relatable entity items by entity name (and optional namespace)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `entityName` | `string` |
| `namespace?` | `string` |

## Returns

[`RelatedEntityItem`](RelatedEntityItem.md)[]
