# BoardErrorCode

```ts
type BoardErrorCode = 
  | "restore_in_progress"
  | "empty_title"
  | "board_not_found"
  | "column_not_found"
  | "task_not_found"
  | "label_not_found"
  | "label_cross_board"
  | "cross_board"
  | "invalid_due_date"
  | "invalid_color"
  | "duplicate_label"
  | "confirm_stale"
  | "task_stale"
  | "labels_changed"
  | "unsupported_primary"
  | "seed_target_not_empty";
```

Defined in: [packages/rxdb-plugin-board/src/errors.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/errors.ts#L9)

Domain error codes.
