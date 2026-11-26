# judgeRawWrite()

```ts
function judgeRawWrite(sql, context): RawWriteJudgment;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts:782](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts#L782)

Judges whether a raw call should be dispatched

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `sql` | `string` | The raw statement, possibly a semicolon-separated batch of statements |
| `context` | [`RawWriteJudgmentContext`](../interfaces/RawWriteJudgmentContext.md) | The capability bit and the versioned domain |

## Returns

[`RawWriteJudgment`](../type-aliases/RawWriteJudgment.md)

Which step it landed on, allow or reject; a **pure function** — reads no global state and does not mutate
`context`

## Remarks

The batch of statements is judged as a whole, not just its first: appending a statement is the cheapest way
to bypass, and judging only the first would let a single harmless statement up front suffice.

## Example

```ts
judgeRawWrite('UPDATE post SET "remoteId" = \'r1\'', { capabilityEnabled: true, domain });
// → `{ kind: 'allow', step: 4, reason: 'untracked_only' }`
```
