# CommitValidationReason

```ts
type CommitValidationReason = 
  | "empty_message"
  | "missing_author"
  | "missing_operation_id"
  | "empty_commit"
  | "user_authored_system_commit";
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/write-commit.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/write-commit.ts#L59)

Why the commit was rejected; each corresponds to a hard constraint of FR-008 / FR-009.
