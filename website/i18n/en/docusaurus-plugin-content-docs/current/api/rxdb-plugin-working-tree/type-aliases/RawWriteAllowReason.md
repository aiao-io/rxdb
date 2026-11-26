# RawWriteAllowReason

```ts
type RawWriteAllowReason = 
  | "capability_disabled"
  | "not_a_write"
  | "untracked_only"
  | "out_of_domain";
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts#L62)

Why the write was allowed; each corresponds to one of the four steps.
