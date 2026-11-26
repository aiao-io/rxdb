# patchDragIconForReadonlyRows()

```ts
function patchDragIconForReadonlyRows(table): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-operations.d.ts:13

HACK: VTable provides no API to disable dragging for specific rows, so this is implemented by monkey-patching internal properties

Read-only rows and new rows get no drag handle; after `setRowDragEnabled(table, false)` no rows get one.

TODO(vtable-upstream): track the VTable upstream API and remove this hack once per-row dragOrder configuration is available

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | The target table instance |

## Returns

`void`

## See

https://github.com/AgoraIO/vtable/issues — search for "drag order per row"
