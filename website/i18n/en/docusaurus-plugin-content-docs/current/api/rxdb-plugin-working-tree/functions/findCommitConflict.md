# findCommitConflict()

```ts
function findCommitConflict(credentials, observed): CommitConflict | undefined;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:127](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L127)

Compares the three captured positions and produces the first mismatch (FR-031).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `credentials` | [`WorkingTreeCredentials`](../interfaces/WorkingTreeCredentials.md) | The three positions captured by the caller |
| `observed` | [`WorkingTreeRevisionSnapshot`](../interfaces/WorkingTreeRevisionSnapshot.md) | The current values read by the command inside its write transaction |

## Returns

[`CommitConflict`](../interfaces/CommitConflict.md) \| `undefined`

The first mismatching [CommitConflict](../interfaces/CommitConflict.md); `undefined` when all three match

## Remarks

**The comparison order is activation → head → working tree, stopping at the first mismatch.** The order follows
"how wrong it is": if the branch is misidentified, the latter two revisions do not belong to the same timeline at all; reporting them first
would lead the caller to "re-read head and retry" — while the correct way out is to first figure out which branch it is on.

**Call sites must put it before any write.** Placed after writes, a rejected commit would still advance
`headRevision` by one, voiding the credentials in other tabs' hands while nothing was actually committed.

On a branch id mismatch, `expected` / `actual` carry the two sides' `activationRevision` — they may
happen to be equal (two branches each activated the same number of times). This is not a bug: the criterion of this path is that
[CommitConflict.branchId](../interfaces/CommitConflict.md#branchid) differs from the caller's `expectedBranch.branchId`,
not the magnitude relationship of the two numbers.
