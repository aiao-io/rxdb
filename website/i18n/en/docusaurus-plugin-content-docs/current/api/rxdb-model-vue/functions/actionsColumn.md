# actionsColumn()

```ts
function actionsColumn(title, deleteLabel, canDelete, viewLabel?): ColumnDefine;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:192

Action column: optionally contains view and delete buttons

## Parameters

| Parameter     | Type                                                                | Description                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`       | `string`                                                            | Column title                                                                                                                                                  |
| `deleteLabel` | `string`                                                            | Delete button copy                                                                                                                                            |
| `canDelete`   | [`RecordDeletePredicate`](../type-aliases/RecordDeletePredicate.md) | Decides per row whether to show a delete button; unrelated to whether the row is readonly (readonly entity rows with `update: 'system'` can still be deleted) |
| `viewLabel?`  | `string`                                                            | View button copy (optional; when omitted only the delete button is shown, so non-deletable rows have no icon)                                                 |

## Returns

`ColumnDefine`

The action column definition (carries no entity data, has a column-level readonly flag, paste / clear never write)
