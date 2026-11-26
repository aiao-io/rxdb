# parseChineseNumber()

```ts
function parseChineseNumber(s): number;
```

Defined in: [packages/utils/src/string/parseChineseNumber.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/string/parseChineseNumber.ts#L84)

Parses Chinese numerals

Uses a two-level model of "section-level units (ten-thousand / hundred-million) + within-section units (thousand / hundred / ten)" rather than per-character decimal shifting — the latter cannot express section-level multiplication such as "fifteen ten-thousands" (UTL-015).

Supported character set:
- Digits: Chinese numerals zero through nine (including the two-variant), financial uppercase numerals, and ASCII `0-9`
- Within-section units: ten / hundred / thousand (and their financial variants)
- Section-level units: ten-thousand / hundred-million
- Negative sign: starting with the Chinese "negative" character or `-`

Semantics:
- Consecutive digit characters compose one number positionally (`10000` → 10000; 15 followed by the ten-thousand unit → 150000)
- Within-section units must strictly decrease (hundred-then-thousand, ten-then-ten throw)
- The same section-level unit must not be reused consecutively (one ten-thousand then two ten-thousands throws; one hundred-million, or one hundred-million twenty ten-thousands, is legal)
- A trailing bare digit lands in the ones place (one ten-thousand one → 10001; one ten-thousand one hundred one → 10101)
- A unit without a preceding digit counts as 1 (ten → 10; ten-thousand → 10000); an explicitly written zero still counts (zero ten-thousands, 0 hundred-millions → 0)

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `s` | `string` | The string to parse; leading/trailing whitespace is allowed |

## Returns

`number`

The parsed number

## Throws

On empty input, unsupported characters, illegal unit ordering, or a result outside the safe-integer range

## Example

Chinese numeral strings such as "fifteen ten-thousands" (→ 150000), "one hundred-million twenty ten-thousands" (→ 120000000), or "negative one hundred" (→ -100) parse to the numbers shown.
