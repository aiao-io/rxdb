# ReplayRestoreRejection

```ts
type ReplayRestoreRejection = 
  | "conflict"
  | "dirty_working_tree"
  | "incompatible_schema"
  | "unreachable_target";
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:7](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L7)

The four reasons `restoreToCommit()` is rejected (same values as the working tree `restore()` `reason`).
