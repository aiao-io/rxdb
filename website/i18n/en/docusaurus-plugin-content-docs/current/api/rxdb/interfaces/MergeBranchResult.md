# MergeBranchResult

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:665](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L665)

Branch merge result

## Properties

### merged \{#merged\}

```ts
merged: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:669](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L669)

The number of merged changes (entity operations applied to the target branch)

---

### sourceDeleted \{#sourcedeleted\}

```ts
sourceDeleted: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:679](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L679)

Whether the source branch has been deleted

---

### sourceDeleteError? \{#sourcedeleteerror\}

```ts
sourceDeleteError?: Error;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:689](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L689)

The reason deleting the source branch failed (only present when `deleteSource: true` and the deletion failed)

#### Remarks

Deleting the source branch is the wrap-up step after the merge has been persisted; a failure neither rolls back the merge nor makes `mergeBranch()` throw —
otherwise callers would think nothing was merged and retry, which under the normal strategy means merging twice.
The merge result is still reflected by `merged` as usual; this field only truthfully reports that the wrap-up failed and why.

---

### strategy \{#strategy\}

```ts
strategy: MergeStrategy;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:674](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L674)

The merge strategy used
