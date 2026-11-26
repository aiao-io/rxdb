# RxDBSyncRuleGroup

```ts
type RxDBSyncRuleGroup = RuleGroupBase<
  typeof RxDBSync,
  | 'id'
  | 'namespace'
  | 'entity'
  | 'syncType'
  | 'lastPushedChangeId'
  | 'lastPushedAt'
  | 'lastPulledAt'
  | 'lastPullRemoteChangeId'
  | 'remoteBackendId'
  | 'enabled'
  | 'createdAt'
  | 'updatedAt'
  | 'branchId'
  | 'branch'
  | 'branch.id'
  | 'branch.activated'
  | 'branch.fromChangeId'
  | 'branch.local'
  | 'branch.remote'
  | 'branch.createdAt'
  | 'branch.updatedAt'
  | 'branch.parentId'
  | 'branch.changes.id'
  | 'branch.changes.remoteId'
  | 'branch.changes.localId'
  | 'branch.changes.type'
  | 'branch.changes.transactionId'
  | 'branch.changes.namespace'
  | 'branch.changes.entity'
  | 'branch.changes.entityId'
  | 'branch.changes.createdAt'
  | 'branch.changes.updatedAt'
  | 'branch.changes.revertChangedAt'
  | 'branch.changes.revertChangeId'
  | 'branch.changes.redoInvalidatedAt'
  | 'branch.changes.branchId'
  | 'branch.children.id'
  | 'branch.children.activated'
  | 'branch.children.fromChangeId'
  | 'branch.children.local'
  | 'branch.children.remote'
  | 'branch.children.createdAt'
  | 'branch.children.updatedAt'
  | 'branch.children.parentId'
  | 'branch.parent.id'
  | 'branch.parent.activated'
  | 'branch.parent.fromChangeId'
  | 'branch.parent.local'
  | 'branch.parent.remote'
  | 'branch.parent.createdAt'
  | 'branch.parent.updatedAt'
  | 'branch.parent.parentId',
  RxDBSyncRule
>;
```

Defined in: [packages/rxdb/src/system/types.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L100)

Rule group base
