# CardDropTarget

```ts
type CardDropTarget = 
  | {
  columnId: UUID;
  kind: "between";
  nextId: UUID | null;
  prevId: UUID | null;
}
  | {
  columnId: UUID;
  kind: "end";
};
```

Defined in: [packages/rxdb-plugin-board/src/drop-resolution.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/drop-resolution.ts#L13)

Card drop target: between two neighbors (first position `prevId=null`, last position `nextId=null`) or append to an empty column.
