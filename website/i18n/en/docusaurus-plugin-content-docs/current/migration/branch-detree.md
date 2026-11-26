# De-treeing `RxDBBranch`

The system entity `RxDBBranch` is no longer a tree entity: its decorator changed from `@TreeEntity` to `@Entity`, and four tree query methods plus one type export were removed. **This is a breaking change**, but the blast radius is tiny — the only audience is code that calls the branch tree queries directly.

**The table structure did not change at all.** The columns, indexes, and foreign keys of `rxdb_branch` are exactly as before, so no system table migration runs, the database version does not change, and the upgrade performs no data operations.

## What was removed

| Location                                                   | Removed members                                                             |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `RxDBBranch` static methods                                | `findDescendants` / `findAncestors` / `countDescendants` / `countAncestors` |
| `LocalRxDBBranchRepository` / `RemoteRxDBBranchRepository` | The same four methods                                                       |
| Top-level exports of `@aiao/rxdb`                          | The `RxDBBranchTreeRuleGroup` type                                          |

The remaining branch queries (`find` / `findAll` / `findOne` / `count` / `get` and so on), plus `parentId`, `parent$`, and `children$`, are all kept with unchanged behavior.

## Replacement

Fetch everything with `find()` and assemble by `parentId` in memory:

```diff
-const descendants = await branchRepository.findDescendants({ where: { id: branchId } });
+const all = await branchRepository.find({ where: {} });
+const byParent = new Map<string | null | undefined, RxDBBranch[]>();
+for (const branch of all) {
+  const siblings = byParent.get(branch.parentId) ?? [];
+  siblings.push(branch);
+  byParent.set(branch.parentId, siblings);
+}
+// Walk byParent level by level, starting from branchId
```

This is what the repository has done internally all along — the four parent-chain traversals for branches (`getPathToRoot`, `collectBranchChain`, the topological sort that writes `sync_branches` to the database, and `remove_branch`) are all handwritten; none of them ever used the tree queries.

## Why remove them

The tree queries cannot provide the three things branch traversal needs:

| What branches need                         | What the recursive CTE provides                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| An **error** on a broken chain or a cycle  | **Silent truncation** — returns a tree missing some limbs, not an error                        |
| An **ordered** path                        | An unordered set; a common ancestor can only be computed by comparing path indexes             |
| A `fromChangeId` interval for each segment | Only understands `parentId`, not the `fromChangeId` / `local` / `remote` semantics of branches |

In other words, on branches these four methods were not merely unused — **using them produces wrong results**: when a branch chain breaks in the middle, the recursive query quietly returns one segment short, and version control switching branches with that result moves data to the wrong point in time. Having four "find ancestors" methods sitting on the type was inviting callers down that path.

## See also

- [Branches](../collaboration/branch.md): the branch model and version control operations
- [Versioning and API stability](../versioning.md): the breaking-change process
