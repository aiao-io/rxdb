# buildEditableColumns()

```ts
function buildEditableColumns(source, options?): ColumnDefine[];
```

Defined in: [packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts:120](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts#L120)

Builds editable VTable column definitions from EntityMetadata.

Columns are ordered as follows:
1. The ID column
2. Regular property columns (skipping SKIP_FIELDS and DISPLAY_ONLY_FIELDS)
3. Computed property columns
4. Foreign key relation columns
5. The createdAt / updatedAt system time columns
6. The actions column (view + delete; delete is derived from the entity's `permissions.delete`, see [deriveEntityCapabilities](deriveEntityCapabilities.md))

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `options?` | [`BuildEditableColumnsOptions`](../interfaces/BuildEditableColumnsOptions.md) | Optional build options |

## Returns

`ColumnDefine`[]

The array of editable column definitions
