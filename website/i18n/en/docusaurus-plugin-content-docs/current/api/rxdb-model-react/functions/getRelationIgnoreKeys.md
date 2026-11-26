# getRelationIgnoreKeys()

```ts
function getRelationIgnoreKeys(relation): string[];
```

Defined in: packages/rxdb-model/dist/query-builder/utils/metadata-field-extractor.d.ts:68

Gets the keys a relation needs to ignore (to avoid circular references)

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `relation` | [`EntityRelationMetadata`](../../rxdb/type-aliases/EntityRelationMetadata.md) | Entity relation metadata |

## Returns

`string`[]

List of keys to ignore

## Remarks

For ONE_TO_MANY and MANY_TO_MANY relations, returns mappedProperty (if present)
to avoid infinite recursion

## Example

```typescript
// ONE_TO_MANY: User.orders -> Order.owner
getRelationIgnoreKeys(ordersRelation) // ['owner']
```
