# calculateOrderBy()

```ts
function calculateOrderBy<T>(result, orderBy): T[];
```

Defined in: [packages/rxdb/src/query/query-matching.utils.ts:504](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/query-matching.utils.ts#L504)

Orders a batch of results by `orderBy`.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `result` | `T`[] | The results to order; **not modified in place** — a new array is returned |
| `orderBy` | [`OrderBy`](../interfaces/OrderBy.md)&lt;`string`&gt;[] | Ordering fields and directions, compared level by level in array order |

## Returns

`T`[]

A new, ordered array.

## Remarks

Pairs with [isEntityMatchWhere](isEntityMatchWhere.md): the former judges "does this row count as a hit", this function judges "how should the hits be ordered". Incremental merging (`query/merge_*.ts`) uses it to insert newly arrived rows at the right position, and plugin-side mock repositories must use it too — otherwise the mocked order differs from a real query and the tests no longer guard the real behavior.

Field access follows lodash path semantics, so a nested field such as `'author.name'` can be used directly as an ordering key.
