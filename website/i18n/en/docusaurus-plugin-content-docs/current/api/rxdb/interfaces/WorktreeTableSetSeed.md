# WorktreeTableSetSeed

Defined in: [packages/rxdb/src/system/worktree-table-set.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/worktree-table-set.ts#L26)

The data seeded in when creating a writable checkout's table set (US-314 B1.5), see the adapter's `createWorktreeTableSet`.

## Remarks

The main table set's rows are copied over as-is, then [WorktreeTableSetSeed.actions](#actions) are applied on top; finally the member tables' change triggers are attached to [WorktreeTableSetSeed.branchId](#branchid).

## Properties

### actions \{#actions\}

```ts
readonly actions: SwitchVersionActions;
```

Defined in: [packages/rxdb/src/system/worktree-table-set.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/worktree-table-set.ts#L35)

The increment from the main checkout's branch to the held branch.

#### Remarks

The patches are in the change log's storage form, and encrypted columns are envelopes; only the member entities of this table set are included, and keys falling outside the table set reject the whole write.

***

### branchId \{#branchid\}

```ts
readonly branchId: string;
```

Defined in: [packages/rxdb/src/system/worktree-table-set.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/worktree-table-set.ts#L28)

The held branch: from now on writes on this table set are recorded under its name
