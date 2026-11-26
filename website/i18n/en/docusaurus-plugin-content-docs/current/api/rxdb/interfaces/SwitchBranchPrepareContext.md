# SwitchBranchPrepareContext

Defined in: [packages/rxdb/src/rxdb-adapter.ts:171](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L171)

The context [SwitchBranchOptions.prepare](SwitchBranchOptions.md#prepare) receives.

## Remarks

Neither field can be omitted. `executor` is the executor of **the switch transaction itself** — what the callback reads and writes on it
lives and dies with the switch that follows; `targetBranchId` is the target branch **after the adapter's resolution**,
not the caller's omittable [SwitchBranchOptions.branchId](SwitchBranchOptions.md#branchid): on the omitted branch,
the precondition check needs to look at the currently active branch in the database, not an `undefined`.

## Properties

### executor \{#executor\}

```ts
readonly executor: TransactionExecutor;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:173](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L173)

The executor of the switch transaction; the callback's reads and writes here are in the same transaction as this switch

***

### targetBranchId \{#targetbranchid\}

```ts
readonly targetBranchId: string;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:175](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L175)

The target branch id after resolution; when [SwitchBranchOptions.branchId](SwitchBranchOptions.md#branchid) is omitted, it is the currently active branch in the database
