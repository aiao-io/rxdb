# replayWorkingTree()

```ts
function replayWorkingTree(head, entries): ColdReplaySnapshot;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts:198](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts#L198)

Replays the net state using `HEAD projection + all working tree units`

## Parameters

| Parameter | Type                                                          | Description                                                 |
| --------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| `head`    | [`ColdReplaySnapshot`](../type-aliases/ColdReplaySnapshot.md) | The business data projection of HEAD                        |
| `entries` | readonly `WorkingTreeEntry`[]                                 | All uncommitted units on that branch, **order-independent** |

## Returns

[`ColdReplaySnapshot`](../type-aliases/ColdReplaySnapshot.md)

The replayed net state

## Throws

[WorkingTreeReplayCorruptionError](../classes/WorkingTreeReplayCorruptionError.md) a unit violated the fold invariant

## Remarks

An `insert`'s net state comes **only** from the patch, mixing in no HEAD fields; an `update` overlays the patch field by field on the HEAD row,
with unmentioned fields kept as-is; a `delete` makes this row disappear, not leaving a row of nulls.

Does not modify the inputs: the HEAD snapshot and the `fields` objects inside it are not mutated in place.

## Example

```ts
const replayed = replayWorkingTree(await projectHead(branch), await readEntries(branch));
expect(diffColdReplay(replayed, await readBusinessTables())).toEqual([]);
```
