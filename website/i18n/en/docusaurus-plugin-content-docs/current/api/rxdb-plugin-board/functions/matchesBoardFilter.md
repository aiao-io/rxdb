# matchesBoardFilter()

```ts
function matchesBoardFilter(
   target, 
   filter, 
   today
): boolean;
```

Defined in: [packages/rxdb-plugin-board/src/filter/board-filter.ts:239](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/filter/board-filter.ts#L239)

Whether a task matches the filter (all conditions ANDed).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `target` | [`BoardFilterTarget`](../interfaces/BoardFilterTarget.md) | - |
| `filter` | [`BoardFilter`](../interfaces/BoardFilter.md) | - |
| `today` | `string` | Local today `YYYY-MM-DD` (the base for relative conditions like `due:overdue`) |

## Returns

`boolean`
