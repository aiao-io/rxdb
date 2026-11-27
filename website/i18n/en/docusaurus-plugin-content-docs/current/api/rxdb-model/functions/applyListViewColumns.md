# applyListViewColumns()

```ts
function applyListViewColumns(columns, state): ColumnDefine[];
```

Defined in: [packages/rxdb-model/src/entity-list/list-view.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/list-view.ts#L65)

Applies field ordering and visibility, and pins the positions of the selection column and the actions column.

## Parameters

| Parameter | Type                                              |
| --------- | ------------------------------------------------- |
| `columns` | readonly `ColumnDefine`[]                         |
| `state`   | [`ListViewState`](../interfaces/ListViewState.md) |

## Returns

`ColumnDefine`[]
