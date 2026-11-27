# allocateBranchGeneration()

```ts
function allocateBranchGeneration(executor): Promise<number>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/activation-state.ts:274](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/activation-state.ts#L274)

Issues the next branch generation: makes the database increment `branchGenerationSeq` in place, then reads the new value back.

## Parameters

| Parameter  | Type                                                                  | Description                                                                                                                   |
| ---------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The executor of the **caller's write transaction**; issuing and persisting the new branch must belong to the same transaction |

## Returns

`Promise`&lt;`number`&gt;

The generation issued this time; 1 for the first issuance

## Throws

RxDBError when the singleton row is missing, or there is more than one row (`rowsAffected !== 1`)

## Remarks

**The addition happens in the database, not in JS** (see buildBranchGenerationAdvance). This used to be a read-modify-write inside the same transaction, justified by "the local write queue has concurrency 1, so read-modify-write within a transaction is atomic"; that sentence takes "only one connection writes this database" as a premise, while `git show f9528e8f:specs/001-working-tree-commits/threat-model.md` §6 already places cross-connection behavior explicitly inside the model — the same database can have a second tab or a second worker writing, and the write queue only serializes the ones inside its own process.

**The return value reads the database, not `read value + 1`.** The read-back lands in the same transaction, which can see the increment it just wrote; a concurrent second issuance is blocked on this row's row lock at this very moment (the SQLite family serializes whole write transactions), so what is read back is exactly the number issued this time. Skipping this read and computing a number in JS would make the UPDATE above pointless — the number would still be caller-computed.

**The read-back also goes through the raw statement** (buildBranchGenerationRead), not the repository: the repository hands out entity instances from the identity map, which cannot see the raw UPDATE above, and on write-back would protect `branchGenerationSeq` as a "local unsaved edit". Both statements therefore travel the same channel — the addition happens in the database and the number is fetched from the database, with no layer in between caching the answer for it.

`rowsAffected !== 1` throws on the spot rather than walking past silently, for the same reason as the missing-row throw in [readWorkingTreeActivationState](readWorkingTreeActivationState.md), and the cost is heavier: a new branch persisted with an untrusted generation mis-hits the same-name-rebuilt row for callers holding the old `(branchId, headRevision)` (ABA), the commit idempotency key dies with it (`commit-idempotency.ts`), and this collision is completely silent at the moment the branch is created.
