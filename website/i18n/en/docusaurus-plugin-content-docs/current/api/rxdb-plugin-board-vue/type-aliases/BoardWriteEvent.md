# BoardWriteEvent

```ts
type BoardWriteEvent =
  | {
      kind: 'move-committed';
      taskId: string;
    }
  | {
      kind: 'move-failed';
      reason: string;
      taskId: string;
    }
  | {
      columnId: string;
      kind: 'column-move-committed';
    }
  | {
      columnId: string;
      kind: 'column-move-failed';
      reason: string;
    }
  | {
      columnId: string;
      kind: 'sort-committed';
      written: boolean;
    }
  | {
      columnId: string;
      kind: 'sort-failed';
      reason: string;
    };
```

Defined in: packages/rxdb-plugin-board/dist/write-notifier.d.ts:9

Write state machine events: the persisted outcome of moves and in-column sorting (committed on success / failed with a reason).
