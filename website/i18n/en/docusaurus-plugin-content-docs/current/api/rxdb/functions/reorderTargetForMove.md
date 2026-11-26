# reorderTargetForMove()

```ts
function reorderTargetForMove<Id>(
   ids, 
   fromIndex, 
   toIndex
): ReorderBetween<Id> | null;
```

Defined in: [packages/rxdb/src/sortable/sortable.utils.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sortable/sortable.utils.ts#L109)

Converts "drag the row at `fromIndex` to `toIndex`" into the neighbor target of `Repository.reorder()`.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-id"></a> `Id` | The entity primary key type |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `ids` | readonly `Id`[] | The id sequence of the current ordering domain before the drag (matching the display order) |
| `fromIndex` | `number` | The index of the dragged row in `ids` |
| `toIndex` | `number` | The final index of the dragged row after it is dropped |

## Returns

[`ReorderBetween`](../interfaces/ReorderBetween.md)&lt;`Id`&gt; \| `null`

The neighbors before and after the drop point; returns `null` when dropped in place (`fromIndex === toIndex`), in which case the caller should not initiate a reorder.

## Throws

RangeError The indices are not legal integer indices of `ids`, or the sequence has fewer than two rows.

## Remarks

The todo pages of all three frameworks and `EntityList` share this conversion: when moving down, the neighbors around the drop point are the original rows at `toIndex` / `toIndex + 1`; when moving up, they are the original rows at `toIndex - 1` / `toIndex`; one side is `null` at either end.

## Example

```typescript
const target = reorderTargetForMove(rows.map(row => row.id), from, to);
if (target) await repository.reorder(rows[from].id, target);
```
