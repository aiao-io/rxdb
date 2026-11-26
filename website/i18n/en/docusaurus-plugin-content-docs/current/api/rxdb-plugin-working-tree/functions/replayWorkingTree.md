# replayWorkingTree()

```ts
function replayWorkingTree(head, entries): ColdReplaySnapshot;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts:198](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts#L198)

Replays the net state from `HEAD projection + all working tree units`

## Parameters

| Parameter | Type                                                          | Description                                                 |
| --------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| `head`    | [`ColdReplaySnapshot`](../type-aliases/ColdReplaySnapshot.md) | HEAD's business data projection                             |
| `entries` | readonly `WorkingTreeEntry`[]                                 | All uncommitted units on that branch, **order-independent** |

## Returns

[`ColdReplaySnapshot`](../type-aliases/ColdReplaySnapshot.md)

The replayed net state

## Throws

[WorkingTreeReplayCorruptionError](../classes/WorkingTreeReplayCorruptionError.md) when a unit violates a folding invariant

## Remarks

An `insert`'s net state comes **only** from its patch, with no fields from HEAD mixed in; an `update` lays
its patch field by field over the HEAD row, keeping unmentioned fields as-is; a `delete` makes the row
disappear, not leaving a row of empty values.

Inputs are not mutated: neither the HEAD snapshot nor the `fields` objects inside it are modified in place.

## Example

```ts
const replayed = replayWorkingTree(await projectHead(branch), await readEntries(branch));
expect(diffColdReplay(replayed, await readBusinessTables())).toEqual([]);
```
