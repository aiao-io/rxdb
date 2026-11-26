# resolveKeyboardMove()

```ts
function resolveKeyboardMove(columns, movedId, direction): CardDropTarget | null;
```

Defined in: [packages/rxdb-plugin-board/src/keyboard.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/keyboard.ts#L84)

Alt + arrow key move target: up/down skips adjacent visible cards in the same column, left/right moves to the same row of the adjacent column (an adjacent empty column appends directly).

## Parameters

| Parameter   | Type                                                                     |
| ----------- | ------------------------------------------------------------------------ |
| `columns`   | readonly [`BoardKeyboardColumn`](../interfaces/BoardKeyboardColumn.md)[] |
| `movedId`   | `` `${string}-${string}-${string}-${string}-${string}` ``                |
| `direction` | [`BoardMoveDirection`](../type-aliases/BoardMoveDirection.md)            |

## Returns

[`CardDropTarget`](../type-aliases/CardDropTarget.md) \| `null`

The move target; `null` (caller writes nothing) at the edges, in place, or when the moved card itself is invisible (there is no "same row" to speak of)

## Remarks

Neighbors come from the complete task sequence (same semantics as `resolveCardDrop`); siblings hidden by the filter are never sandwiched between two neighbors.
