# resolveCardDrop()

```ts
function resolveCardDrop(
   columns, 
   movedId, 
   x, 
   y
): CardDropTarget | null;
```

Defined in: [packages/rxdb-plugin-board/src/drop-resolution.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/drop-resolution.ts#L47)

Pointer coordinates → column head / between two neighbors / column tail / empty column; a drop at the original position returns `null` (the caller does not start a reorder).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `columns` | readonly [`CardDropColumnView`](../interfaces/CardDropColumnView.md)[] |
| `movedId` | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `x` | `number` |
| `y` | `number` |

## Returns

[`CardDropTarget`](../type-aliases/CardDropTarget.md) \| `null`

## Remarks

Cards are judged before / after by their top and bottom halves; the empty zone at the column head lands before the first card, the empty zone at the column tail (from the last card's bottom edge to the column body's bottom edge)
lands after the last card, and gaps between cards are assigned to before/after by the y distance to the edges of the two cards above and below;
an empty column is entirely "column tail" and lands on `{ kind: 'end' }`. Returns `null` when the pointer is not inside any column container.
Neighbors always come from the **complete** task sequence — using only visible rows would sandwich hidden siblings between two neighbors,
and `reorder()` rejects the adjacency re-check with `staleTarget` (the same edge case as US-027).
