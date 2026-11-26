# resolveMenuMove()

```ts
function resolveMenuMove(
   columns, 
   movedId, 
   targetColumnId, 
   position
): CardDropTarget | null;
```

Defined in: [packages/rxdb-plugin-board/src/drop-resolution.ts:151](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/drop-resolution.ts#L151)

Menu-based move target (US-539 AC#6 keyboard-equivalent path): insertion index within the target column → between target.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `columns` | readonly [`MenuMoveColumnView`](../interfaces/MenuMoveColumnView.md)[] |
| `movedId` | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `targetColumnId` | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `position` | `number` |

## Returns

[`CardDropTarget`](../type-aliases/CardDropTarget.md) \| `null`

## Remarks

`position` is the insertion index within the target column's sequence after removing the dragged row (0 = column head, length = column tail);
returns `null` when it matches the original position (caller writes nothing) and when the target column does not exist.
Shares the same neighbor semantics as [resolveCardDrop](resolveCardDrop.md): neighbors come from the complete sequence, not just the visible rows.
