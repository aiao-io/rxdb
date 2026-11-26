# RxDBBranchCreationContext

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L61)

The context a contributor needs to write its rows when a new branch is created

## Remarks

`executor` is the **caller's** transaction executor, not a newly opened one. Contributors must use it: if the branch row and
the contribution rows live in two transactions, an in-between failure leaves a record "branch present, contribution rows absent" —
and such a half branch is indistinguishable in shape from a normal old branch.

## Properties

### branchId \{#branchid\}

```ts
readonly branchId: string;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L66)

The id of the branch just written

***

### executor \{#executor\}

```ts
readonly executor: TransactionExecutor;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L63)

The transaction executor writing this branch

***

### fromCommitId? \{#fromcommitid\}

```ts
readonly fromCommitId?: string;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L77)

The source commit named by the caller; provided only on the "create branch from commit" path (US-314). When none is named, this key is absent

#### Remarks

Same division of labor as [RxDBBranchSwitchPreconditions](../type-aliases/RxDBBranchSwitchPreconditions.md): the field's shape lives in core, its meaning in the capability plugin. Core does not read it
and hands it to each contributor as-is — `@aiao/rxdb-plugin-working-tree` uses it to make the new branch's HEAD this commit and the working tree empty,
instead of copying the working tree by fork point or writing a separate branch baseline. The `parentId` / `fromChangeId` on the branch row are still written by the caller,
and must be exactly the fork point recorded by this commit; contributors verify.
