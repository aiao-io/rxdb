# findCommitConflict()

```ts
function findCommitConflict(credentials, observed): CommitConflict | undefined;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:127](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L127)

Compares the three captured slots and produces the first mismatch (FR-031).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `credentials` | [`WorkingTreeCredentials`](../interfaces/WorkingTreeCredentials.md) | The three slots captured by the caller |
| `observed` | [`WorkingTreeRevisionSnapshot`](../interfaces/WorkingTreeRevisionSnapshot.md) | The current values the command read inside its write transaction |

## Returns

[`CommitConflict`](../interfaces/CommitConflict.md) \| `undefined`

The first mismatching [CommitConflict](../interfaces/CommitConflict.md); `undefined` when all three match

## Remarks

**The comparison order is activation → head → working tree, stopping at the first mismatch.** The order is
sorted by "how wrong the mistake is": if the branch is misidentified, the latter two revisions do not even
belong to the same timeline, and reporting them first would send the caller toward "re-read head and retry" —
while the correct way out is to first figure out which branch it is on.

**Call sites must place it before any write.** Placed after the write, a rejected commit would still advance
`headRevision` by one, invalidating every other tab's held credentials while nothing was actually committed.

When the branch ids mismatch, `expected` / `actual` carry the two sides' `activationRevision` — which may
happen to be equal (two branches each activated the same number of times). That is not a bug: this path's
criterion is that [CommitConflict.branchId](../interfaces/CommitConflict.md#branchid) differs from the
caller's `expectedBranch.branchId`, not the magnitude relation between the two numbers.
