# assertColdReplayInvariant()

```ts
function assertColdReplayInvariant(input): void;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts:365](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts#L365)

Verifies the cold replay invariant

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | [`ColdReplayInvariantInput`](../interfaces/ColdReplayInvariantInput.md) | The HEAD projection, all units, and the actual contents of the business tables |

## Returns

`void`

## Throws

[ColdReplayMismatchError](../classes/ColdReplayMismatchError.md) when the replay result does not match the business tables

## Throws

[WorkingTreeReplayCorruptionError](../classes/WorkingTreeReplayCorruptionError.md) when a unit violates a folding invariant

## Remarks

Called at the end of every capture suite test case. It returns silently on equality — no "passed" line is
printed, because in the logs of 6 backends × a dozen groups, success lines only drown the failure lines.

## Example

```ts
assertColdReplayInvariant({ head, entries, actual: await readBusinessTables() });
```
