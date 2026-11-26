# BranchMaterializationBarrierContext

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L75)

The scene handed to the source side inside the barrier transaction.

## Extended by

- [`BranchMaterializationProjectionContext`](BranchMaterializationProjectionContext.md)

## Properties

### executor \{#executor\}

```ts
readonly executor: TransactionExecutor;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L89)

The executor of the barrier transaction; **must be used for reads and writes**.

#### Remarks

What an implementation writing its own transaction persists would remain in the database if any later step of
the barrier fails — the user would see half of the target branch's data while active still points at the
source branch.

***

### intent \{#intent\}

```ts
readonly intent: BranchMaterializationIntent;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L80)

The intent frozen on the staging.

***

### targetBranchId \{#targetbranchid\}

```ts
readonly targetBranchId: string;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L77)

The id of the target branch being materialized.
