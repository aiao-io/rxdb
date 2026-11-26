# orderExclusionUpdates()

```ts
function orderExclusionUpdates<T>(
   metadata, 
   items, 
   changeOf
): T[];
```

Defined in: [packages/rxdb/src/system/exclusion-write-order.ts:114](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/exclusion-write-order.ts#L114)

Orders a set of updates for one entity: narrowing ones first, the rest keeping their original relative order (stable grouping, not a full sort).

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | Entity metadata; returned unchanged when there is no exclusion range |
| `items` | readonly `T`[] | The updates to be executed |
| `changeOf` | (`item`) => \| [`ExclusionUpdateChange`](../interfaces/ExclusionUpdateChange.md) \| `undefined` | Fetches the old and new values of an update; treated as "not narrowing" when unavailable |

## Returns

`T`[]

The newly ordered array
