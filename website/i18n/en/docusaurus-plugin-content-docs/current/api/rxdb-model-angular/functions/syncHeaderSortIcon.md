# syncHeaderSortIcon()

```ts
function syncHeaderSortIcon(table, click): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-operations.d.ts:43

Syncs the column header sort icon without performing client-side sorting

## Parameters

| Parameter | Type                                                  | Description                      |
| --------- | ----------------------------------------------------- | -------------------------------- |
| `table`   | `ListTableAll`                                        | The target table instance        |
| `click`   | [`HeaderSortClick`](../interfaces/HeaderSortClick.md) | The `sort_click` event arguments |

## Returns

`void`

## Remarks

The business layer returns `false` in `sort_click` to stop VTable's client-side sorting and re-sort through the query instead;
but returning `false` also makes VTable skip recording the sort state, leaving the icon at normal, so the next click starts from asc again
and never reaches desc / normal. This function records the state here (`executeSort = false`) so the icon and the rotation work correctly.

## Example

```typescript
table.on('sort_click', args => {
  emitSort(args);
  syncHeaderSortIcon(table, args);
  return false;
});
```
