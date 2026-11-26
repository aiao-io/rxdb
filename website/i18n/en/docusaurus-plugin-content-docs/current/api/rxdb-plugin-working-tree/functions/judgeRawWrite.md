# judgeRawWrite()

```ts
function judgeRawWrite(sql, context): RawWriteJudgment;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts:782](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts#L782)

Determines whether one raw call should be issued

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `sql` | `string` | The original statement; may be a semicolon-separated batch of statements |
| `context` | [`RawWriteJudgmentContext`](../interfaces/RawWriteJudgmentContext.md) | Capability bit and versioned domain |

## Returns

[`RawWriteJudgment`](../type-aliases/RawWriteJudgment.md)

Which step it landed on, allow or reject; a **pure function** — reads no global state and does not modify `context`

## Remarks

A statement batch is judged as a whole, not only its first statement: appending a statement is the cheapest way to bypass; judging only the first would mean
a harmless statement up front is enough.

## Example

```ts
judgeRawWrite('UPDATE post SET "remoteId" = \'r1\'', { capabilityEnabled: true, domain });
// → `{ kind: 'allow', step: 4, reason: 'untracked_only' }`
```
