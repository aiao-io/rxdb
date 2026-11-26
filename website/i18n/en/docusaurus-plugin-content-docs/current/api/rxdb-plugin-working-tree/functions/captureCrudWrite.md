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

Wraps one ordinary CRUD write into the four steps of working tree capture (FR-039)

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-tresult"></a> `TResult` | Return type of the business write |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `port` | [`WorkingTreeCapturePort`](../interfaces/WorkingTreeCapturePort.md) | The capture port, bound to the current transaction by the caller |
| `token` | [`ActiveBranchToken`](../interfaces/ActiveBranchToken.md) | The active branch token captured by the caller at entity read / instantiation time |
| `write` | [`CapturedWrite`](../interfaces/CapturedWrite.md) | The write to capture this time |
| `businessWrite` | () => `Promise`&lt;`TResult`&gt; | The business write, **not yet executed** |

## Returns

`Promise`&lt;`TResult`&gt;

The return value of `businessWrite`, passed through as-is

## Throws

[StaleActiveBranchError](../classes/StaleActiveBranchError.md) the token has expired; in that case `businessWrite` is never called even once

## Remarks

The four-step order is the contract: **validate token → write business entity → write or merge the complete unit → bump `workingTreeRevision`**.
The caller must put these four steps in the **same transaction**; any step failing rolls back everything.

Three orderings must not be swapped:

- **Token validation comes before the business write.** Moved after, it becomes "write first, discover the branch is wrong, clean up via rollback".
  The raw channel and the bulk write path have already paid for "reject before execution"; the hottest CRUD path has no reason to concede.
- **The bump comes after landing the entry.** Reversed, the revision is already +1 when the entry write fails — and it is the CAS basis of commit;
  one failed `save()` would void the revision in another tab's hands out of thin air.
- **Reading the existing entry comes before landing the entry**, and reads the **database**, not an in-memory dirty set. Refresh the page once and the dirty set is empty,
  so `inversePatch` would be recorded as the post-refresh value, discard could never return to HEAD again, and no error ever surfaces.

The `entryCount` increment is taken **verbatim from the fold** ([foldWorkingTreeEntry](foldWorkingTreeEntry.md)); capture does not count itself:
counting a second time is a second truth, and one without test coverage.

## Example

```ts
await adapter.transaction(async tx => {
  const port = createCapturePort(tx);
  return captureCrudWrite(port, entity.branchToken, toCapturedWrite(entity), () => tx.upsert(entity));
});
```
