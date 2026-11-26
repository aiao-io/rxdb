# ExpectedActiveBranch

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:289](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L289)

The active branch assertion the caller **stated** (the type of [StaleActiveBranchError.expected](../classes/StaleActiveBranchError.md#expected))

## Remarks

One notch looser than [ActiveBranchToken](ActiveBranchToken.md), and what is loosened is precisely `branchId`: write-path callers hand in the full captured value (an `ActiveBranchToken` is directly assignable here), while `switchBranch(branchId, options)` callers can only hand in the single number `expectedActivationRevision` through the public entry `RxDBBranchSwitchPreconditions` — a shape pinned by a "exactly these two fields, no more" type assertion, with no slot for the branch inside.

**`null` says "no statement", not "don't know".** An earlier version backfilled it with the database's **current** branchId, producing a token that never existed (`B@3`: the caller is really at A@3, the database at B@7), and consumers would look up B by `expected.branchId`. The judgment itself doesn't need this slot: `activationRevision` is a **database-level singleton row** (`working-tree-activation-state`, +1 per switch), and the generation number alone pins the activation state down.

## Properties

### activationRevision \{#activationrevision\}

```ts
readonly activationRevision: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:294](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L294)

The activation revision the caller captured or asserted

---

### branchId \{#branchid\}

```ts
readonly branchId: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:291](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L291)

The active branch ID the caller captured; `null` = the caller only asserted the generation, and stated nothing about the branch
