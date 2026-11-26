# splitHighlight()

```ts
function splitHighlight(text, ranges): TextSegment[];
```

Defined in: [palette/fuzzy.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/fuzzy.ts#L98)

Splits text by match ranges so the UI can render highlights safely (without using innerHTML).

## Parameters

| Parameter | Type                                                     | Description        |
| --------- | -------------------------------------------------------- | ------------------ |
| `text`    | `string`                                                 | The original text. |
| `ranges`  | readonly [`MatchRange`](../type-aliases/MatchRange.md)[] | The match ranges.  |

## Returns

[`TextSegment`](../interfaces/TextSegment.md)[]

Alternating unmatched / matched segments.
