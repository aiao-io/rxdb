# actionsColumn()

```ts
function actionsColumn(
   title, 
   deleteLabel, 
   canDelete, 
   viewLabel?
): ColumnDefine;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:192

Action column: optionally contains view and delete buttons

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `title` | `string` | The column title |
| `deleteLabel` | `string` | The delete button copy |
| `canDelete` | [`RecordDeletePredicate`](../type-aliases/RecordDeletePredicate.md) | Decides per row whether to show the delete button; independent of whether the row is read-only (rows of entities with `update: 'system'` are read-only but still deletable) |
| `viewLabel?` | `string` | The view button copy (optional; when omitted only the delete button is shown, so non-deletable rows have no icon) |

## Returns

`ColumnDefine`

The action column definition (carries no entity data, has a column-level read-only flag, and is not written by paste / clear)
