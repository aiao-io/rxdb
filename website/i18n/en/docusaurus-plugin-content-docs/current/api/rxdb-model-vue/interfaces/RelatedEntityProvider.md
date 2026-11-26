# RelatedEntityProvider()

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:99

Related entity data provider

## Remarks

Returns the list of selectable related entities by entity name (and optional namespace)

```ts
RelatedEntityProvider(entityName, namespace?): RelatedEntityItem[];
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:101

Gets the selectable related entity items by entity name (and optional namespace)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `entityName` | `string` |
| `namespace?` | `string` |

## Returns

[`RelatedEntityItem`](RelatedEntityItem.md)[]
