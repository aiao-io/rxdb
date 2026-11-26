# CardDropTarget

```ts
type CardDropTarget =
  | {
      columnId: UUID;
      kind: 'between';
      nextId: UUID | null;
      prevId: UUID | null;
    }
  | {
      columnId: UUID;
      kind: 'end';
    };
```

Defined in: packages/rxdb-plugin-board/dist/drop-resolution.d.ts:11

Card drop target: between two neighbors (head `prevId=null`, tail `nextId=null`) or append to an empty column.
