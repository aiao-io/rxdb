# getListViewFields()

```ts
function getListViewFields(columns): ListViewField[];
```

Defined in: [packages/rxdb-model/src/entity-list/list-view.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/list-view.ts#L50)

Extracts configurable fields from table columns, excluding the actions and selection columns.

## Parameters

| Parameter | Type                      |
| --------- | ------------------------- |
| `columns` | readonly `ColumnDefine`[] |

## Returns

[`ListViewField`](../interfaces/ListViewField.md)[]
