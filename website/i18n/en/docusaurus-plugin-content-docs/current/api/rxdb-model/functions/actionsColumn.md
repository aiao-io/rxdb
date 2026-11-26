# actionsColumn()

```ts
function actionsColumn(
   title, 
   deleteLabel, 
   canDelete, 
   viewLabel?
): ColumnDefine;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:673](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L673)

The actions column: optionally contains view and delete buttons.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `title` | `string` | The column title |
| `deleteLabel` | `string` | The delete button copy |
| `canDelete` | [`RecordDeletePredicate`](../type-aliases/RecordDeletePredicate.md) | Decides per row whether to show a delete button; independent of whether the row is read-only (entity rows with `update: 'system'` are read-only yet still deletable) |
| `viewLabel?` | `string` | The view button copy (optional; when omitted only the delete button is shown, so non-deletable rows have no icon) |

## Returns

`ColumnDefine`

The actions column definition (carries no entity data, has a column-level read-only flag, and is not written to by paste / clear)
