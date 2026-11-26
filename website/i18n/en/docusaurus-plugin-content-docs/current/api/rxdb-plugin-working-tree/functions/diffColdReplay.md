# diffColdReplay()

```ts
function diffColdReplay(replayed, actual): readonly ColdReplayMismatch[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts:303](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts#L303)

Compares the replay result against the business tables' actual content

## Parameters

| Parameter  | Type                                                          | Description                                             |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| `replayed` | [`ColdReplaySnapshot`](../type-aliases/ColdReplaySnapshot.md) | The result of [replayWorkingTree](replayWorkingTree.md) |
| `actual`   | [`ColdReplaySnapshot`](../type-aliases/ColdReplaySnapshot.md) | The actual content read from the business tables        |

## Returns

readonly [`ColdReplayMismatch`](../type-aliases/ColdReplayMismatch.md)[]

All differences; an empty array when equal

## Remarks

**Both directions are defects**: business tables changed without a unit (`field_mismatch` or `business_only_row`) means a mount point was missed; a unit with no such row in the business table (`replay_only_row`) means capture wrote what it shouldn't have. A criterion checking only one direction passes the other half of the failures.

Row order on either side does not participate in the comparison.
