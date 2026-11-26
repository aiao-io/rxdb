# resolveColumnDrop()

```ts
function resolveColumnDrop(
   columns, 
   columnIds, 
   movedId, 
   x
): 
  | {
  nextId: `${string}-${string}-${string}-${string}-${string}` | null;
  prevId: `${string}-${string}-${string}-${string}-${string}` | null;
}
  | null;
```

Defined in: [packages/rxdb-plugin-board/src/drop-resolution.ts:171](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/drop-resolution.ts#L171)

Horizontal column-header drag → the two neighbors; returns `null` in place. Column order is computed from the complete sequence within the board.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `columns` | readonly [`ColumnDropView`](../interfaces/ColumnDropView.md)[] |
| `columnIds` | readonly `` `${string}-${string}-${string}-${string}-${string}` ``[] |
| `movedId` | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `x` | `number` |

## Returns

  \| \{
  `nextId`: `` `${string}-${string}-${string}-${string}-${string}` `` \| `null`;
  `prevId`: `` `${string}-${string}-${string}-${string}-${string}` `` \| `null`;
\}
  \| `null`
