# patchDragIconForReadonlyRows()

```ts
function patchDragIconForReadonlyRows(table): void;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-operations.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-operations.ts#L18)

HACK: VTable provides no API to disable dragging for specific rows, so this is implemented by monkey-patching an internal property.

Read-only rows and new rows get no handle; after `setRowDragEnabled(table, false)` no rows get one.

TODO(vtable-upstream): track the VTable upstream API, and remove this hack once a per-row dragOrder configuration is available.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | The target table instance |

## Returns

`void`

## See

https://github.com/AgoraIO/vtable/issues — search for "drag order per row"
