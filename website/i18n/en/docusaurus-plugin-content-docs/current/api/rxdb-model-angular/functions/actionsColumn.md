# actionsColumn()

```ts
function actionsColumn(title, deleteLabel, canDelete, viewLabel?): ColumnDefine;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:192

The action column: optionally contains view and delete buttons

## Parameters

| Parameter     | Type                                                                | Description                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `title`       | `string`                                                            | The column title                                                                                                                                                         |
| `deleteLabel` | `string`                                                            | The delete button copy                                                                                                                                                   |
| `canDelete`   | [`RecordDeletePredicate`](../type-aliases/RecordDeletePredicate.md) | Decides per row whether to show the delete button; independent of whether the row is readonly (a readonly row of an entity with `update: 'system'` can still be deleted) |
| `viewLabel?`  | `string`                                                            | The view button copy (optional; when omitted only the delete button is shown, so rows that cannot be deleted have no icon)                                               |

## Returns

`ColumnDefine`

The action column definition (carries no entity data, has a column-level readonly flag, and paste / clear do not write to it)
