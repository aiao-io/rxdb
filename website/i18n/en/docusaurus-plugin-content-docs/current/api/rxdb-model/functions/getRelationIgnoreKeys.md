# getRelationIgnoreKeys()

```ts
function getRelationIgnoreKeys(relation): string[];
```

Defined in: [packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts#L110)

Gets the keys a relation needs to ignore (to avoid circular references).

## Parameters

| Parameter  | Type                                                                          | Description                  |
| ---------- | ----------------------------------------------------------------------------- | ---------------------------- |
| `relation` | [`EntityRelationMetadata`](../../rxdb/type-aliases/EntityRelationMetadata.md) | The entity relation metadata |

## Returns

`string`[]

The list of keys to ignore

## Remarks

For ONE_TO_MANY and MANY_TO_MANY relations, returns mappedProperty (if present)
to avoid infinite recursion.

## Example

```typescript
// ONE_TO_MANY: User.orders -> Order.owner
getRelationIgnoreKeys(ordersRelation); // ['owner']
```
