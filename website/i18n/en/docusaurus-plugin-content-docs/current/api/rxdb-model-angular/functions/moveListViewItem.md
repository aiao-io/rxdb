# moveListViewItem()

```ts
function moveListViewItem<T>(items, index, direction): T[];
```

Defined in: packages/rxdb-model/dist/entity-list/list-view.d.ts:39

Moves a field or a sort rule, keeping the original order when crossing the boundary.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter   | Type           |
| ----------- | -------------- |
| `items`     | readonly `T`[] |
| `index`     | `number`       |
| `direction` | `-1` \| `1`    |

## Returns

`T`[]
