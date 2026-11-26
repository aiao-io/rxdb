# toggleBoardFilterValue()

```ts
function toggleBoardFilterValue(query, field, value): string;
```

Defined in: [packages/rxdb-plugin-board/src/filter/board-filter.ts:248](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/filter/board-filter.ts#L248)

Click-to-filter: removes the value if it already exists in the query (in a non-negated token), otherwise appends a `field:value` token.

## Parameters

| Parameter | Type                                                      |
| --------- | --------------------------------------------------------- |
| `query`   | `string`                                                  |
| `field`   | [`BoardFilterField`](../type-aliases/BoardFilterField.md) |
| `value`   | `string`                                                  |

## Returns

`string`

The new query string (single spaces between tokens)
