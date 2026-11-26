# reorderTargetForDrop()

```ts
function reorderTargetForDrop<Id>(groupIds, movedId, targetId, position): ReorderBetween<Id> | null;
```

Defined in: [packages/rxdb/src/sortable/sortable.utils.ts:146](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sortable/sortable.utils.ts#L146)

Converts "drop above / below the target row" into the neighbor target for `Repository.reorder()`.

## Type Parameters

| Type Parameter                      | Description                 |
| ----------------------------------- | --------------------------- |
| <a id="type-parameter-id"></a> `Id` | The entity primary key type |

## Parameters

| Parameter  | Type                    | Description                                                                                                                                                                                           |
| ---------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `groupIds` | readonly `Id`[]         | The **complete** sequence of the group the target row belongs to (matching the manual order in the database, ids unique, including rows that are filtered out or outside the render window in the UI) |
| `movedId`  | `Id`                    | The id of the dragged row; not present in `groupIds` when dropped across groups                                                                                                                       |
| `targetId` | `Id`                    | The id of the target row the drop lands on                                                                                                                                                            |
| `position` | `"before"` \| `"after"` | Whether to place it above (`before`) or below (`after`) the target row                                                                                                                                |

## Returns

[`ReorderBetween`](../interfaces/ReorderBetween.md)&lt;`Id`&gt; \| `null`

The neighbors around the drop point, with `targetId` on at least one side; returns `null` when the dragged row is already at that position, in which case the caller should not initiate a reorder

## Throws

RangeError when `movedId` equals `targetId`, or when `targetId` is not in `groupIds`

## Remarks

Division of labor with [reorderTargetForMove](reorderTargetForMove.md): that one answers "row at position `from` dragged to position `to` within the same sequence",
suited for flat lists; this one answers "drop next to a row", where the dragged row may come from another group — cross-parent drops in tree pages can only be expressed this way.

Neighbors are always taken from the `groupIds` sequence with the dragged row removed. Taking only the rows visible in the UI would sandwich hidden siblings between the two neighbors,
and `reorder()` rejects them with `staleTarget` when re-checking adjacency.

## Example

```typescript
const target = reorderTargetForDrop(siblingIds, draggedId, overId, 'after');
if (target) await repository.reorder(draggedId, target);
```
