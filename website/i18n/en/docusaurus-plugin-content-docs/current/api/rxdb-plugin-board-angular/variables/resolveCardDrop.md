# resolveCardDrop

```ts
const resolveCardDrop: (columns, movedId, x, y) => CardDropTarget | null;
```

Defined in: packages/rxdb-plugin-board/dist/drop-resolution.d.ts:46

Pointer coordinates → column head / between two neighbors / column tail / empty column; an in-place drop returns `null` (the caller does not start a reorder).

## Parameters

| Parameter | Type                                                                                        |
| --------- | ------------------------------------------------------------------------------------------- |
| `columns` | readonly [`CardDropColumnView`](../../rxdb-plugin-board/interfaces/CardDropColumnView.md)[] |
| `movedId` | [`UUID`](../../rxdb/type-aliases/UUID.md)                                                   |
| `x`       | `number`                                                                                    |
| `y`       | `number`                                                                                    |

## Returns

[`CardDropTarget`](../type-aliases/CardDropTarget.md) \| `null`

## Remarks

Cards are split into top and bottom halves to determine before / after; the empty area at the column head lands before the first card, and the empty area at the column tail (from the bottom edge of the last card to the bottom edge of the column body)
lands after the last card; gaps between cards are assigned to before/after by the distance of y to the edges of the two neighboring cards;
an entire empty column is a "column tail", landing on `{ kind: 'end' }`. `null` is returned when the pointer is not inside any column container.
Neighbors always come from the **complete** task sequence — taking only visible rows would sandwich hidden siblings between two neighbors,
and `reorder()` rejects with `staleTarget` when re-checking adjacency (the same boundary as US-027).
