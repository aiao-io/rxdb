# RxDBBranchSwitchTakeoverContext

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:162](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L162)

The context received by [RxDBSystemContribution.takeOverBranchSwitch](RxDBSystemContribution.md#takeoverbranchswitch)

## Remarks

There is exactly one difference from [RxDBBranchSwitchContext](RxDBBranchSwitchContext.md), and that one difference decides the division of labor between the two hooks:
**there is no `executor` here**. The first two things a takeover side must do (pulling the remote snapshot, persisting page by page) cannot fit into any
switch transaction — network I/O holding a write transaction would lock the whole database until timeout, and the whole point of page-by-page persistence is
"survives a mid-way crash", the exact opposite of "lives and dies together". So the takeover side finishes them outside the transaction first, and as the last step
initiates `adapter.switchBranch()` itself, putting the commit barrier into that switch's `prepare` —
materialization and active switch in one transaction; either both land, or neither does.

## Properties

### currentBranchId \{#currentbranchid\}

```ts
readonly currentBranchId: string | null;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:164](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L164)

The current branch id; `null` when there is no active branch at all

---

### preconditions \{#preconditions\}

```ts
readonly preconditions:
  | RxDBBranchSwitchPreconditions
  | undefined;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:170](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L170)

The preconditions proposed by the caller; `undefined` when none were proposed, which is the same thing as an empty object

---

### targetBranchId \{#targetbranchid\}

```ts
readonly targetBranchId: string;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:167](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L167)

The id of the branch to switch to
