# syncHeaderSortIcon()

```ts
function syncHeaderSortIcon(table, click): void;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-operations.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-operations.ts#L66)

Syncs the column header sort icon, without performing client-side sorting.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | The target table instance |
| `click` | [`HeaderSortClick`](../interfaces/HeaderSortClick.md) | The `sort_click` event arguments |

## Returns

`void`

## Remarks

The business layer returns `false` in `sort_click` to stop VTable client-side sorting and re-sort via the query instead;
but returning `false` also makes VTable skip recording the sort state, so the icon stays at normal and the next click starts from asc again,
never reaching desc / normal. This records the state here (`executeSort = false`) so the icon and the rotation work correctly.

## Example

```typescript
table.on('sort_click', args => {
  emitSort(args);
  syncHeaderSortIcon(table, args);
  return false;
});
```
