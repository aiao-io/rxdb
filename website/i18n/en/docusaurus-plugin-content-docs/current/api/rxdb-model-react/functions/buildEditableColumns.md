# buildEditableColumns()

```ts
function buildEditableColumns(source, options?): ColumnDefine[];
```

Defined in: packages/rxdb-model/dist/entity-table/columns/build-editable-columns.d.ts:56

Builds editable VTable column definitions from EntityMetadata

Columns are ordered as follows:
1. ID column
2. Regular property columns (skipping SKIP_FIELDS and DISPLAY_ONLY_FIELDS)
3. Computed property columns
4. Foreign-key relation columns
5. createdAt / updatedAt system time columns
6. Action columns (view + delete; delete is derived from the entity's `permissions.delete`, see [deriveEntityCapabilities](../variables/deriveEntityCapabilities.md))

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | The entity metadata |
| `options?` | [`BuildEditableColumnsOptions`](../interfaces/BuildEditableColumnsOptions.md) | Optional build options |

## Returns

`ColumnDefine`[]

The editable column definition array
