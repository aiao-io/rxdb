# WriteOperation

```ts
type WriteOperation = "insert" | "update" | "delete";
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts#L40)

The operation kind of one write; only `update` may produce no net change.
