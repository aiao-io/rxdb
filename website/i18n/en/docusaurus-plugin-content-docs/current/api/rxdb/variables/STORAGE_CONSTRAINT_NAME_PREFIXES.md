# STORAGE_CONSTRAINT_NAME_PREFIXES

```ts
const STORAGE_CONSTRAINT_NAME_PREFIXES: readonly ["ck_", "uq_", "ex_"];
```

Defined in: [packages/rxdb/src/system/constraint-drift.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/constraint-drift.ts#L60)

Object name prefixes covered by drift comparison: `ck_` CHECK, `uq_` conditional unique index, `ex_` range exclusion.
