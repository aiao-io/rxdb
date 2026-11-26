# BoardReadState

```ts
type BoardReadState = 
  | {
  kind: "loading";
}
  | {
  kind: "failed";
  message: string;
}
  | {
  kind: "ready";
  snapshot: BoardReadSnapshot;
};
```

Defined in: [packages/rxdb-plugin-board/src/board-read.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-read.ts#L19)

The snapshot is published only after all sub-collections are ready; failures stay distinguishable.
