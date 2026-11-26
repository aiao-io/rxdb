# SwitchBranchPrepareContext

Defined in: [packages/rxdb/src/rxdb-adapter.ts:171](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L171)

The context [SwitchBranchOptions.prepare](SwitchBranchOptions.md#prepare) receives.

## Remarks

Neither field can be omitted. `executor` is the executor of **the switch transaction itself** — what the
callback reads and writes on it lives or dies together with the coming switch; `targetBranchId` is the target
branch **after the adapter resolves it**, not the caller's omittable
[SwitchBranchOptions.branchId](SwitchBranchOptions.md#branchid): on the omitting branch, what the precondition
validation must look at is the currently active branch in the database, not an `undefined`.

## Properties

### executor \{#executor\}

```ts
readonly executor: TransactionExecutor;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:173](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L173)

The switch transaction's executor; reads and writes the callback does here are in the same transaction as
this switch.

***

### targetBranchId \{#targetbranchid\}

```ts
readonly targetBranchId: string;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:175](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L175)

The resolved target branch id; when [SwitchBranchOptions.branchId](SwitchBranchOptions.md#branchid) is omitted,
it is the branch currently activated in the database.
