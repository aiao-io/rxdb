# rankItems()

```ts
function rankItems<T>(
   query, 
   items, 
   limit
): Ranked<T>[];
```

Defined in: [palette/fuzzy.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/fuzzy.ts#L139)

Ranks candidates against a query: hits in the primary text weigh more than hits in secondary text and keywords; ties keep the original order.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`Rankable`](../interfaces/Rankable.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `query` | `string` | The query text. |
| `items` | readonly `T`[] | The candidates. |
| `limit` | `number` | The maximum number of results. |

## Returns

[`Ranked`](../interfaces/Ranked.md)&lt;`T`&gt;[]

The matched candidates, ordered by score from high to low.
