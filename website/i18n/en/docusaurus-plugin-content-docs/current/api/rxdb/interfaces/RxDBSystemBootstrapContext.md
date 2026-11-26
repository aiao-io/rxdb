# RxDBSystemBootstrapContext

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L35)

Context available at table-creation time

## Remarks

Only exposes facts that **actually exist** at the moment tables are created. Today that is only the main branch's id — a fresh database contains nothing else when tables are created (see the new-database branch of `RxDB.connect()`). When contributors need more context, add fields here rather than reading the database themselves: at that point the tables do not exist yet.

## Properties

### branchIds \{#branchids\}

```ts
readonly branchIds: readonly string[];
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L37)

Branch ids written together at table creation; exactly one (`'main'`) on a fresh database
