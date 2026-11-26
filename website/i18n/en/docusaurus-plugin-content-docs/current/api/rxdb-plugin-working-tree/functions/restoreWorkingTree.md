# restoreWorkingTree()

```ts
function restoreWorkingTree(executor, context, target, options): Promise<WorkingTreeRestoreResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts:396](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts#L396)

Writes the target commit's contents back into the current working tree as new uncommitted changes (FR-013).

## Parameters

| Parameter  | Type                                                                    | Description                                                                                                               |
| ---------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md)   | The executor of the caller's write transaction; this function does **not open its own transaction**                       |
| `context`  | `CommitWriteContext`                                                    | See CommitWriteContext: the entity manager for building entry rows and the codec resolution context                       |
| `target`   | [`WorkingTreeRestoreTarget`](../interfaces/WorkingTreeRestoreTarget.md) | See [WorkingTreeRestoreTarget](../interfaces/WorkingTreeRestoreTarget.md); with `entities` omitted it is the whole commit |
| `options`  | [`WorkingTreeCredentials`](../interfaces/WorkingTreeCredentials.md)     | See [WorkingTreeRestoreOptions](../type-aliases/WorkingTreeRestoreOptions.md); all three captured positions are required  |

## Returns

`Promise`&lt;[`WorkingTreeRestoreResult`](../type-aliases/WorkingTreeRestoreResult.md)&gt;

See [WorkingTreeRestoreResult](../type-aliases/WorkingTreeRestoreResult.md)

## Throws

CommitGraphCorruptedError when the current branch's commit graph is corrupted (FR-051)

## Throws

TypeError what is stored in a history row's `patch` column is not a plain object

## Remarks

Every step's order has a reason:

1. **Read the active branch token first**; everything after targets it. Querying again mid-transaction and writing the restore there would land a restore
   the user clicked on branch A into branch B's working tree.
2. **The corruption guard comes before everything.** Reversed, a restore on an already-corrupted chain whose credentials happen to match would land directly,
   materializing a stretch of history that cannot even validate itself into the working tree (FR-051).
3. **The three comparisons, the dirty guard, reachability, the emptiness judgment, and the compatibility precheck** all come before any write. Any failure returns the failure
   exit, at which point nothing needs rolling back — this is exactly why they are return values rather than exceptions (the physical meaning of FR-033's "zero change"
   here is this ordering).
4. **CAS, writing entries, writing the session**, all inside the caller's one transaction (see writeRestore).

The dirty criterion reads `state.entryCount` — the **same expression** as `status().clean`. Implemented separately, the two will eventually
diverge at some change, and the symptom of divergence is "the UI says clean, restore says dirty", with no way for the user to find out where the difference is
(FR-014).

An empty materialization result (none of the `entities` matched) and an empty replay path take the **same** no-op exit: what both would write is
zero, and creating an active session row for a zero write is exactly the dead corner named by FR-042.
