# matchText()

```ts
function matchText(query, text): MatchResult | null;
```

Defined in: [palette/fuzzy.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/fuzzy.ts#L77)

Fuzzy match: the query is split on whitespace into several terms, and every term must match; contiguous substrings outrank scattered subsequences, with bonuses for starts and word boundaries.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `query` | `string` | The query text. |
| `text` | `string` | The text to match against. |

## Returns

[`MatchResult`](../interfaces/MatchResult.md) \| `null`

The match result; returns `null` when any term misses or the query is empty.
