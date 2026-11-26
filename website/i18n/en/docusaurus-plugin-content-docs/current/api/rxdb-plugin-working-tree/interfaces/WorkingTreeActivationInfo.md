# WorkingTreeActivationInfo

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/activation-state.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/activation-state.ts#L46)

The read-only view of the activation state singleton row.

## Remarks

Deliberately does not reuse the entity class: entity instances carry writable shapes like `save()`, while every change to this row must go through CAS (US-308), and no path should ever "read it, change it, save it back".

Just these two fields. **Must not** add `activeBranchId` — see this file's `@fileoverview` for the reason.

## Properties

### activationRevision \{#activationrevision\}

```ts
readonly activationRevision: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/activation-state.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/activation-state.ts#L48)

The activation state revision; +1 after a successful switch-branch CAS (the increment belongs to US-308)

---

### branchGenerationSeq \{#branchgenerationseq\}

```ts
readonly branchGenerationSeq: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/activation-state.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/activation-state.ts#L50)

The branch generation monotonic source; +1 and consumed on create branch, so the first issued generation is 1
