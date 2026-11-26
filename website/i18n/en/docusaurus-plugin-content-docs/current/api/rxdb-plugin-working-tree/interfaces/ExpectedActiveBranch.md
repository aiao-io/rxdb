# ExpectedActiveBranch

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:289](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L289)

The active branch assertion **raised by** the caller (the type of [StaleActiveBranchError.expected](../classes/StaleActiveBranchError.md#expected)).

## Remarks

One notch looser than [ActiveBranchToken](ActiveBranchToken.md), and the notch is exactly `branchId`: write-path callers hand over the full captured value (`ActiveBranchToken` is directly assignable), while callers of `switchBranch(branchId, options)` can only hand over the single number `expectedActivationRevision` through the public entry `RxDBBranchSwitchPreconditions` — that shape is pinned by a type assertion of "exactly these two fields, no more no less", and there is no branch slot in it.

**`null` means "no position taken", not "unknown".** A previous version filled it with the database's **current** branchId, fabricating a token that never existed (`B@3`: the caller is actually at A@3 while the database is at B@7), and consumers would look up B by `expected.branchId`. The judgment itself does not need this slot: `activationRevision` is a **database-level singleton row** (`working-tree-activation-state`, +1 on every switch), and the generation number alone pins the activation state down.

## Properties

### activationRevision \{#activationrevision\}

```ts
readonly activationRevision: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:294](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L294)

The activation revision captured or asserted by the caller

***

### branchId \{#branchid\}

```ts
readonly branchId: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:291](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L291)

The active branch ID captured by the caller; `null` = the caller only asserted the generation, taking no position on the branch
