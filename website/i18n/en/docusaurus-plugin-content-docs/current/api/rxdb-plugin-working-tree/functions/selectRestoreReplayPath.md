# selectRestoreReplayPath()

```ts
function selectRestoreReplayPath(executor, headCommitId, targetCommitId): Promise<readonly string[] | undefined>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:211](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L211)

Selects the deterministic path to roll back for "restore to the target node".

## Parameters

| Parameter        | Type                                                                  | Description                                           |
| ---------------- | --------------------------------------------------------------------- | ----------------------------------------------------- |
| `executor`       | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The current transaction executor                      |
| `headCommitId`   | `string` \| `null`                                                    | The current branch's HEAD; `null` for an empty branch |
| `targetCommitId` | `string`                                                              | The target commit id                                  |

## Returns

`Promise`&lt;readonly `string`[] \| `undefined`&gt;

The nodes to apply `inversePatch` to one by one, in replay order (HEAD first);
`undefined` when the target is not on HEAD's reachable parent chain

## Remarks

The path = **HEAD's reachable set minus the target's reachable set**, not "walk back from HEAD until reaching the target". The two are identical on linear history and different on diamond-shaped history: the target's own ancestors are also in HEAD's reachable set, and rounding them up from the other edge counts them among the nodes to roll back, so the restore action also rolls back history **before** the target.

The order uses the level-by-level backtracking order from the HEAD side, so it is deterministic: the same graph yields the same path every time, and only then can the "first incompatible node" be stable (FR-050).

Returns `undefined` rather than throwing: "this commit is not in the current branch's history" is a **judgment result** the caller must convert into a failure exit (FR-033 only permits restoring reachable nodes), not a broken library.
