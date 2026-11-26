# RelatedItemsProviderFactory

```ts
type RelatedItemsProviderFactory = (fkField, relatedEntityName) => 
  | (() => RelatedEntityItem[])
  | undefined;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts#L27)

Factory for related-entity candidate providers: returns a provider function from the foreign key field and related entity name

## Parameters

| Parameter | Type |
| ------ | ------ |
| `fkField` | `string` |
| `relatedEntityName` | `string` |

## Returns

  \| (() => [`RelatedEntityItem`](../interfaces/RelatedEntityItem.md)[])
  \| `undefined`
