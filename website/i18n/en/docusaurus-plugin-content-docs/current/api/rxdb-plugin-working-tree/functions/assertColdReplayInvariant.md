# assertColdReplayInvariant()

```ts
function assertColdReplayInvariant(input): void;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts:365](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts#L365)

Verifies the cold replay invariant

## Parameters

| Parameter | Type                                                                    | Description                                               |
| --------- | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| `input`   | [`ColdReplayInvariantInput`](../interfaces/ColdReplayInvariantInput.md) | HEAD projection, all units, actual business table content |

## Returns

`void`

## Throws

[ColdReplayMismatchError](../classes/ColdReplayMismatchError.md) the replay result does not match the business tables

## Throws

[WorkingTreeReplayCorruptionError](../classes/WorkingTreeReplayCorruptionError.md) a unit violated the fold invariant

## Remarks

Called at the end of every test case group in the capture suite. Returns silently when equal — it does not print "passed", because in the logs of 6 backends × a dozen groups,
success lines would only drown the failure lines.

## Example

```ts
assertColdReplayInvariant({ head, entries, actual: await readBusinessTables() });
```
