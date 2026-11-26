# WorktreeTableSetSeed

Defined in: [packages/rxdb/src/system/worktree-table-set.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/worktree-table-set.ts#L26)

The data laid in when creating a writable checkout's table set (US-314 B1.5); see the adapter's
`createWorktreeTableSet`.

## Remarks

The primary table set's rows are copied over as-is, then [WorktreeTableSetSeed.actions](#actions) are layered
on top; finally the member tables' change triggers are attached to [WorktreeTableSetSeed.branchId](#branchid).

## Properties

### actions \{#actions\}

```ts
readonly actions: SwitchVersionActions;
```

Defined in: [packages/rxdb/src/system/worktree-table-set.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/worktree-table-set.ts#L35)

The increments along the path from the primary checkout's branch to the holding branch.

#### Remarks

Patches are in the change log's storage form, and encrypted columns are envelopes; only member entities of
this table set are included, and a key falling outside the table set rejects the whole entry.

---

### branchId \{#branchid\}

```ts
readonly branchId: string;
```

Defined in: [packages/rxdb/src/system/worktree-table-set.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/worktree-table-set.ts#L28)

The holding branch: writes on this table set are recorded under its name from now on.
