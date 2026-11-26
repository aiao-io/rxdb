# parseUpdatedAt()

```ts
function parseUpdatedAt(value, context): number;
```

Defined in: [packages/rxdb/src/repository/updated-at.utils.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/updated-at.utils.ts#L22)

Parses `updatedAt` into a millisecond point in time.

## Parameters

| Parameter | Type     | Description                                                               |
| --------- | -------- | ------------------------------------------------------------------------- |
| `value`   | `string` | The time string to parse                                                  |
| `context` | `string` | The context used to locate the error, e.g. `"the remote of entity 'p-1'"` |

## Returns

`number`

The millisecond point in time

## Throws

TypeError when no point in time can be parsed.

## Remarks

Does not return 0, and does not treat parse failure as "stale": that would let one piece of bad data turn the entire QueryCache into
a full re-pull on every round, completely silently. Failing to pull and re-pulling forever are both failures, but the latter cannot be diagnosed.
