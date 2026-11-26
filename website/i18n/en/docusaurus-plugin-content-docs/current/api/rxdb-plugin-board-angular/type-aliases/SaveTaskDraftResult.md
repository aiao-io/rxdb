# SaveTaskDraftResult

```ts
type SaveTaskDraftResult =
  | {
      kind: 'saved';
      task: InstanceType<typeof Task>;
    }
  | {
      kind: 'unchanged';
    };
```

Defined in: packages/rxdb-plugin-board/dist/detail-service.d.ts:31

Save result: written (with the re-queried task) or zero-write because the content is unchanged.
