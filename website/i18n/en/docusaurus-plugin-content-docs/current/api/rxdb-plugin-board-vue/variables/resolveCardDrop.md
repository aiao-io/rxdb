# resolveCardDrop

```ts
const resolveCardDrop: (columns, movedId, x, y) => CardDropTarget | null;
```

Defined in: packages/rxdb-plugin-board/dist/drop-resolution.d.ts:46

Pointer coordinates → column start / between two neighbors / column end / empty column; returns `null` for an in-place drop (the caller does not start a reorder).

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

Cards are judged by their upper/lower halves for before / after; the empty area at the top of a column lands before the first card, the empty area at the bottom (from the bottom edge of the last card to the bottom edge of the column body) lands after the last card, and gaps between cards are assigned to before/after by the y-distance to the edges of the two adjacent cards; an empty column is entirely "column end", landing on `{ kind: 'end' }`. Returns `null` when the pointer is not inside any column container. Neighbors are always taken from the **complete** task sequence — using only visible rows would sandwich hidden siblings between two neighbors, and `reorder()` rejects the re-check with `staleTarget` when the adjacency no longer holds (the same boundary as US-027).
