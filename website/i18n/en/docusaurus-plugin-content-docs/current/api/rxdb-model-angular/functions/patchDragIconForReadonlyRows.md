# patchDragIconForReadonlyRows()

```ts
function patchDragIconForReadonlyRows(table): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-operations.d.ts:13

HACK: VTable does not provide an API to disable drag on specific rows, so this monkey-patches internal properties.

Readonly rows and new rows get no drag handle; after `setRowDragEnabled(table, false)` no rows get one.

TODO(vtable-upstream): track the VTable upstream API; once a per-row dragOrder configuration is available this hack can be removed.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | The target table instance |

## Returns

`void`

## See

https://github.com/AgoraIO/vtable/issues — search "drag order per row"
