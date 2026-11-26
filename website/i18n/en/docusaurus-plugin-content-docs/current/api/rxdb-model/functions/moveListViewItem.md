# moveListViewItem()

```ts
function moveListViewItem<T>(items, index, direction): T[];
```

Defined in: [packages/rxdb-model/src/entity-list/list-view.ts:133](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/list-view.ts#L133)

Moves a field or sort rule, keeping the original order when crossing a boundary.

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
