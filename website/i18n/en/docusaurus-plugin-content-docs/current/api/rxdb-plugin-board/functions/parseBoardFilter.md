# parseBoardFilter()

```ts
function parseBoardFilter(query): BoardFilter;
```

Defined in: [packages/rxdb-plugin-board/src/filter/board-filter.ts:181](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/filter/board-filter.ts#L181)

Parses the filter query string. Incomplete field tokens (e.g. `label:`) produce no condition.

## Parameters

| Parameter | Type     |
| --------- | -------- |
| `query`   | `string` |

## Returns

[`BoardFilter`](../interfaces/BoardFilter.md)
