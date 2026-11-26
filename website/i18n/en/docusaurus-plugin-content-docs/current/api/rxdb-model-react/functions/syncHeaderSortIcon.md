# syncHeaderSortIcon()

```ts
function syncHeaderSortIcon(table, click): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-operations.d.ts:43

Syncs the column header sort icon without performing client-side sorting

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | Target table instance |
| `click` | [`HeaderSortClick`](../interfaces/HeaderSortClick.md) | The `sort_click` event arguments |

## Returns

`void`

## Remarks

The business layer returns `false` in `sort_click` to prevent VTable's client-side sorting and let the query reorder instead;
but returning `false` also makes VTable skip recording the sort state, so the icon stays at normal, the next click starts from asc again,
and it can never reach desc / normal. This records the state (`executeSort = false`) so the icon and rotation work correctly.

## Example

```typescript
table.on('sort_click', args => {
  emitSort(args);
  syncHeaderSortIcon(table, args);
  return false;
});
```
