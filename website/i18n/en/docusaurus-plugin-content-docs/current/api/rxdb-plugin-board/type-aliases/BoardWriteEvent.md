# BoardWriteEvent

```ts
type BoardWriteEvent = 
  | {
  kind: "move-committed";
  taskId: string;
}
  | {
  kind: "move-failed";
  reason: string;
  taskId: string;
}
  | {
  columnId: string;
  kind: "column-move-committed";
}
  | {
  columnId: string;
  kind: "column-move-failed";
  reason: string;
}
  | {
  columnId: string;
  kind: "sort-committed";
  written: boolean;
}
  | {
  columnId: string;
  kind: "sort-failed";
  reason: string;
};
```

Defined in: [packages/rxdb-plugin-board/src/write-notifier.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/write-notifier.ts#L11)

Write state machine events: the persisted result of a move or column sort (committed on success / reason on failure).
