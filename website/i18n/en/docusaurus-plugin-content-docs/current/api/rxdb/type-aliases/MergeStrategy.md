# MergeStrategy

```ts
type MergeStrategy = 'squash' | 'normal';
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:643](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L643)

Merge strategy

- `squash` (default): compress all changes of the source branch into one set of transaction records on the target branch
- `normal`: copy the source branch's changes to the target branch one by one
