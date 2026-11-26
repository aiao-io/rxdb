# SwitchBranchOptions

Defined in: [packages/rxdb/src/rxdb-adapter.ts:187](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L187)

Parameters of `adapter.switchBranch()`.

## Remarks

This primitive does two things at once: **switching the active branch**, and **applying a batch of
[SwitchVersionActions](SwitchVersionActions.md)** (history replay needs only the latter; omitting
[SwitchBranchOptions.branchId](#branchid) makes the actions land on the current branch). The two share one
transaction — that is exactly why it is not split into two methods: splitting would leave an unguarded window
between them.

## Properties

### actions \{#actions\}

```ts
actions: SwitchVersionActions;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:206](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L206)

The version actions to apply in the same transaction as this switch (undo/redo write-back, redo-stack
invalidation, etc.).

#### Remarks

Required but may be an empty action set. Being in the same transaction as the branch switch is intentional:
the actions change the visibility of the change log, while the branch switch changes where the triggers point —
if the two were in separate transactions, writes in between would be mislabeled.

---

### branchId? \{#branchid\}

```ts
branchId?: string;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:197](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L197)

Target branch id.

#### Remarks

Omitted means "act on the current active branch" — resolved by the adapter **inside** the switch transaction,
and the active branch stays unchanged. The history subsystem (redo invalidation, undo/redo replay) uses this
method to batch-apply [SwitchVersionActions](SwitchVersionActions.md); it never wants to change branches. If the
caller queried the current branch first and then passed it in, a real switch happening between the two awaits
would make this late call roll `activated` and all the change-log triggers back to the old branch, mislabeling
every subsequent write.

---

### prepare \{#prepare\}

```ts
prepare: context => Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:225](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L225)

Pre-hook inside the switch transaction: the adapter awaits it after resolving the target branch and before
touching the first row.

#### Parameters

| Parameter | Type                                                          |
| --------- | ------------------------------------------------------------- |
| `context` | [`SwitchBranchPrepareContext`](SwitchBranchPrepareContext.md) |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

**The adapter's obligation**: call it after resolving `branchId` and before deleting triggers / changing
`activated` / applying actions — exactly once per switch. Whatever it throws is rethrown as-is and rolled back
by the transaction — do not catch it, and do not "note it down for later".

**The caller's obligation**: required. The preconditions of a branch switch (is the working tree clean, is the
commit graph reachable without corruption, are the generational credentials expired) used to run in **another
read-only transaction**, and the window between that transaction and the actual switch was guarded by nothing:
validation says "clean", a write in the window makes it dirty, and the switch completes anyway. Moved here,
"validation passed" and "switch completed" are no longer two things that can happen separately.

Made required rather than `?` for the same reason none of the nine `RxDBSystemContribution` contribution points
carries a `?`: `?` makes "not needed" and "forgotten" the same thing, and here the symptom of forgetting is
that the switch still succeeds — it just never got validated. Call sites that genuinely need no validation
(history replay only batch-applies actions via this method and never changes branches) write an explicit empty
implementation; that one line is a statement of "I really don't need it".
