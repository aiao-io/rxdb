# BranchMaterializationProjectionContext

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L93)

The scene handed to the source side when projecting one page into local write operations.

## Extends

- [`BranchMaterializationBarrierContext`](BranchMaterializationBarrierContext.md)

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

#### Inherited from

[`BranchMaterializationBarrierContext`](BranchMaterializationBarrierContext.md).[`executor`](BranchMaterializationBarrierContext.md#executor)

---

### intent \{#intent\}

```ts
readonly intent: BranchMaterializationIntent;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L80)

The intent frozen on the staging.

#### Inherited from

[`BranchMaterializationBarrierContext`](BranchMaterializationBarrierContext.md).[`intent`](BranchMaterializationBarrierContext.md#intent)

---

### page \{#page\}

```ts
readonly page: BranchMaterializationPage;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L95)

This page.

---

### targetBranchId \{#targetbranchid\}

```ts
readonly targetBranchId: string;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L77)

The id of the target branch being materialized.

#### Inherited from

[`BranchMaterializationBarrierContext`](BranchMaterializationBarrierContext.md).[`targetBranchId`](BranchMaterializationBarrierContext.md#targetbranchid)
