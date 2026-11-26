# patchDragIconForReadonlyRows()

```ts
function patchDragIconForReadonlyRows(table): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-operations.d.ts:13

HACK: VTable provides no API to disable dragging for specific rows; implemented by monkey-patching internal properties

Readonly rows and new rows get no handle; after `setRowDragEnabled(table, false)` no rows get one.

TODO(vtable-upstream): track the VTable upstream API; remove this hack once a per-row dragOrder config is provided

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | The target table instance |

## Returns

`void`

## See

https://github.com/AgoraIO/vtable/issues — search "drag order per row"
