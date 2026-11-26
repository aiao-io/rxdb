# suggestBoardFilter()

```ts
function suggestBoardFilter(query, context): BoardFilterSuggestion[];
```

Defined in: [packages/rxdb-plugin-board/src/filter/board-filter.ts:281](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/filter/board-filter.ts#L281)

Input completion: the cursor is treated as being at the end of the query. Completes fields when the end is whitespace or a field name is being typed;
completes values after a field name (multi-value tokens complete only the last segment), and appends a space after a value is selected.

## Parameters

| Parameter | Type                                                        |
| --------- | ----------------------------------------------------------- |
| `query`   | `string`                                                    |
| `context` | [`BoardFilterContext`](../interfaces/BoardFilterContext.md) |

## Returns

[`BoardFilterSuggestion`](../interfaces/BoardFilterSuggestion.md)[]
