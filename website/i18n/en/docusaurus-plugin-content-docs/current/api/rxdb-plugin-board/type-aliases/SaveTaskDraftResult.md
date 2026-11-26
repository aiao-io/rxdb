# SaveTaskDraftResult

```ts
type SaveTaskDraftResult = 
  | {
  kind: "saved";
  task: InstanceType<typeof Task>;
}
  | {
  kind: "unchanged";
};
```

Defined in: [packages/rxdb-plugin-board/src/detail-service.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/detail-service.ts#L43)

Save result: written (with the re-queried task) or zero writes because the content did not change.
