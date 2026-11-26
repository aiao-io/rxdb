# commitWorkingTree()

```ts
function commitWorkingTree(
   executor, 
   context, 
   message, 
   options
): Promise<CommitResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-command.ts:275](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-command.ts#L275)

Commits all uncommitted units in the current branch's working tree (FR-041).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The caller's write-transaction executor; this function does **not open its own transaction** |
| `context` | `CommitWriteContext` | See CommitWriteContext: the entity manager for creating commit rows and the at-rest judgment context |
| `message` | `string` | The user message; trimmed before persisting, an empty message is rejected by `writeCommit()` |
| `options` | [`CommitOptions`](../interfaces/CommitOptions.md) | See [CommitOptions](../interfaces/CommitOptions.md); all three capture positions are required |

## Returns

`Promise`&lt;[`CommitResult`](../type-aliases/CommitResult.md)&gt;

See [CommitResult](../type-aliases/CommitResult.md)

## Throws

CommitGraphCorruptedError when the current branch's commit graph is corrupted (FR-051)

## Throws

[CommitValidationError](../classes/CommitValidationError.md) when the message is empty, or the working tree is clean (`empty_commit`)

## Throws

NoActiveBranchError when there are zero active branches

## Remarks

The step order is fully justified:

1. **Read the active branch token first**, and attach everything after it to that branch. Re-reading the active branch mid-transaction and attributing this commit to it is a forbidden shape: it can never fail, at the price of changes the user sees on branch A being written into branch B's history.
2. **The corruption guard precedes CAS.** The other way around, a commit on an already-corrupted chain whose credentials happen to match would land directly, hanging the new node off a history that fails its own validation (FR-051).
3. **All three comparisons precede any write**; any mismatch returns [CommitConflict](../interfaces/CommitConflict.md) — except the **original-request retry** case (RV-041): when HEAD / working tree revision mismatch but `operationId` corresponds to a persisted commit whose `message` / `author` both match, return that commit directly and go no further. `activation_revision` is not covered by this exception — a wrong branch cannot be "retried", so it falls through to the conflict as-is.
4. **Write commit → clear entries → single-row status UPDATE**, all inside the caller's single transaction.

On a clean branch, **throw `empty_commit`** rather than returning an `ok: true` empty commit: an empty commit leaves a zero-content node in history, after which every "nothing to commit" grows another, and `log()` has no basis to hide them.
