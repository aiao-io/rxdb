# RelatedItemsProviderFactory

```ts
type RelatedItemsProviderFactory = (fkField, relatedEntityName) => 
  | (() => RelatedEntityItem[])
  | undefined;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/build-editable-columns.d.ts:11

Related entity candidate provider factory: returns a provider function based on the foreign key field and related entity name

## Parameters

| Parameter | Type |
| ------ | ------ |
| `fkField` | `string` |
| `relatedEntityName` | `string` |

## Returns

  \| (() => [`RelatedEntityItem`](../interfaces/RelatedEntityItem.md)[])
  \| `undefined`
