# captureCrudWrite()

```ts
function captureCrudWrite<TResult>(
   port, 
   token, 
   write, 
   businessWrite
): Promise<TResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:448](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L448)

The four steps that wrap an ordinary CRUD write into working tree capture (FR-039)

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-tresult"></a> `TResult` | The business write's return type |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `port` | [`WorkingTreeCapturePort`](../interfaces/WorkingTreeCapturePort.md) | The capture port, bound by the caller to the current transaction |
| `token` | [`ActiveBranchToken`](../interfaces/ActiveBranchToken.md) | The active branch token captured by the caller when reading / instantiating entities |
| `write` | [`CapturedWrite`](../interfaces/CapturedWrite.md) | The write to capture this time |
| `businessWrite` | () => `Promise`&lt;`TResult`&gt; | The **not-yet-executed** business write |

## Returns

`Promise`&lt;`TResult`&gt;

`businessWrite`'s return value, passed through unchanged

## Throws

[StaleActiveBranchError](../classes/StaleActiveBranchError.md) when the token is expired; in that case
`businessWrite` is never called

## Remarks

The four steps' order is the contract: **validate the token → write the business entity → write or merge the
full unit → increment `workingTreeRevision`**. The caller must put these four steps in **the same
transaction**; if any step fails, everything rolls back.

Three orderings cannot be swapped:

- **Token validation comes before the business write.** Moved after, it becomes "write first, discover the
  wrong branch, clean up via rollback". The raw channel and the batch write path have both already paid the
  price for "reject before execution"; the hottest path, CRUD, has no reason to give in.
- **The increment comes after the entry lands.** Reversed, the revision is already +1 when the entry write
  fails — and it is the basis of commit's CAS; one failed `save()` would invalidate another tab's held
  revision for nothing.
- **Reading existing entries comes before landing the entry**, and it reads the **database**, not an
  in-memory dirty set. Refresh the page once and the dirty set is empty, so `inversePatch` gets recorded
  against the post-refresh values, and discard can never return to HEAD again — with no error shape at all.

The `entryCount` delta is taken **verbatim from the fold** ([foldWorkingTreeEntry](foldWorkingTreeEntry.md));
capture does not count on its own: a second count is a second copy of the truth, and the one without test
coverage.

## Example

```ts
await adapter.transaction(async tx => {
  const port = createCapturePort(tx);
  return captureCrudWrite(port, entity.branchToken, toCapturedWrite(entity), () => tx.upsert(entity));
});
```
