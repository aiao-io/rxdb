# getListViewFields()

```ts
function getListViewFields(columns): ListViewField[];
```

Defined in: packages/rxdb-model/dist/entity-list/list-view.d.ts:29

Extracts the configurable fields from the table columns, excluding the action and selection columns.

## Parameters

| Parameter | Type                      |
| --------- | ------------------------- |
| `columns` | readonly `ColumnDefine`[] |

## Returns

[`ListViewField`](../interfaces/ListViewField.md)[]
