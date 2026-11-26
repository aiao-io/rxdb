# resolveColumnDrop

```ts
const resolveColumnDrop: (columns, columnIds, movedId, x) => 
  | {
  nextId: UUID | null;
  prevId: UUID | null;
}
  | null;
```

Defined in: packages/rxdb-plugin-board/dist/drop-resolution.d.ts:86

Horizontal drag of a column header → the two adjacent neighbors; in-place returns `null`. Column order is converted from the complete in-board sequence.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `columns` | readonly [`ColumnDropView`](../../rxdb-plugin-board/interfaces/ColumnDropView.md)[] |
| `columnIds` | readonly [`UUID`](../../rxdb/type-aliases/UUID.md)[] |
| `movedId` | [`UUID`](../../rxdb/type-aliases/UUID.md) |
| `x` | `number` |

## Returns

  \| \{
  `nextId`: [`UUID`](../../rxdb/type-aliases/UUID.md) \| `null`;
  `prevId`: [`UUID`](../../rxdb/type-aliases/UUID.md) \| `null`;
\}
  \| `null`
