# restoreWorkingTree()

```ts
function restoreWorkingTree(executor, context, target, options): Promise<WorkingTreeRestoreResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts:396](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts#L396)

Writes the target commit's contents back into the current working tree as new uncommitted changes (FR-013).

## Parameters

| Parameter  | Type                                                                    | Description                                                                                                              |
| ---------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md)   | The executor of the caller's write transaction; this function does **not open its own transaction**                      |
| `context`  | `CommitWriteContext`                                                    | See CommitWriteContext: the entity manager for building entry rows and the codec resolution context                      |
| `target`   | [`WorkingTreeRestoreTarget`](../interfaces/WorkingTreeRestoreTarget.md) | See [WorkingTreeRestoreTarget](../interfaces/WorkingTreeRestoreTarget.md); default `entities` means the whole commit     |
| `options`  | [`WorkingTreeCredentials`](../interfaces/WorkingTreeCredentials.md)     | See [WorkingTreeRestoreOptions](../type-aliases/WorkingTreeRestoreOptions.md); the three captured slots are all required |

## Returns

`Promise`&lt;[`WorkingTreeRestoreResult`](../type-aliases/WorkingTreeRestoreResult.md)&gt;

See [WorkingTreeRestoreResult](../type-aliases/WorkingTreeRestoreResult.md)

## Throws

CommitGraphCorruptedError when the current branch's commit graph is corrupted (FR-051)

## Throws

TypeError when a history row's `patch` column does not hold a plain object

## Remarks

Every step of the order has a reason:

1. **Read the active branch token first**, and everything after is done against it. Querying again mid-
   transaction and writing the restore there would mean a restore the user clicked on branch A landing in
   branch B's working tree.
2. **The corruption guard comes before everything.** Reversed, a restore whose credentials happen to match on
   an already-corrupted chain would persist directly, materializing a stretch of history that cannot even
   validate itself into the working tree (FR-051).
3. **The three comparisons, the dirty guard, reachability, the emptiness check, and the compatibility
   preflight all precede any write.** If any fails, the failure exit returns — at which point there is
   nothing to roll back, which is exactly why these are return values rather than exceptions (the physical
   meaning of FR-033's "zero change" here is this order).
4. **The CAS, entry writes, and session write all happen in the caller's one transaction** (see writeRestore).

The dirty criterion reads `state.entryCount` — the **same expression** as `status().clean`. Implemented
separately, the two would inevitably diverge in some future change, and the symptom of the divergence is
"the UI says clean, restore says dirty" with no way for the user to find the discrepancy (FR-014).

An empty materialization result (`entities` matched nothing) and an empty replay path take the **same** no-op
exit: both have zero things to write, and creating an active session row for a zero-write is precisely the
dead corner FR-042 calls out.
