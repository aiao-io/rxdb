# DeletePlan

```ts
type DeletePlan = 
  | TaskDeletePlan
  | ColumnDeletePlan
  | BoardDeletePlan;
```

Defined in: [packages/rxdb-plugin-board/src/delete-service.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/delete-service.ts#L55)

Deletion plan: task / column / board, distinguished by `kind`.
