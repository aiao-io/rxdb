# exclusionRangeExpressionPG()

```ts
function exclusionRangeExpressionPG(range): string;
```

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:230](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L230)

The `EXCLUDE` element expression for a one-dimensional range on the PG side.

## Parameters

| Parameter | Type                                                                |
| --------- | ------------------------------------------------------------------- |
| `range`   | [`CompiledExclusionRange`](../interfaces/CompiledExclusionRange.md) |

## Returns

`string`

## Remarks

Inverted ranges are mapped to `'empty'` via `CASE`: the range constructor throws `22000` on `from > to`,
while the SQLite trigger treats it as an empty range — with both backends handling it as empty, the error classes do not diverge.

The bigint `[]` dimension has one extra branch: PG normalizes a discrete closed range into `[from, to + 1)`, and when `to` is the int8 maximum it
throws `22003` — a legitimate row cannot be written even with no competing row at all. In the discrete domain, "≤ maximum" and "unbounded above" are the same set of values,
so this row is constructed as `int8range(from, NULL, '[)')`, with intersection semantics matching the SQLite trigger; this end of the conflict key is thus shaped like an unbounded
range, and the normalized `ranges` report `null` on PG (SQLite reports the original value). The expression enters the constraint name's hash, so this branch renames
the exclusions of bigint `[]` dimensions, and existing libraries must rebuild per the migration notes; expressions for other domains and `[)` dimensions remain character-for-character unchanged.
