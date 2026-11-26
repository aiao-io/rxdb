# WorkingTreeResource

```ts
type WorkingTreeResource = Readonly<WorkingTreeAsyncStates> & WorkingTreeCommands;
```

Defined in: [use-working-tree.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts#L62)

The working tree entry returned by [useWorkingTree](../functions/useWorkingTree.md) in the current render.

## Remarks

The fourteen state fields map one-to-one to core's `WorkingTreeAsyncStates`, and their values are plain read-only values that can be destructured directly. The signatures of the fourteen methods are identical to the same-named methods on the plugin package's `WorkingTreeManager` (the `switchBranch` one is on `VersionManager`) — inputs and return values all use the types from `@aiao/rxdb-plugin-working-tree`; this package does **not redefine them** (tri-framework-api.md §1).

Method references are **stable** (the same closure set is reused across renders for the same database), so they can safely go into `useEffect` / `useMemo` dependency arrays; state fields produce a new object on every phase change, which is exactly what drives re-renders.

Equivalent implementations across all three frameworks: Angular `useWorkingTree()` (`Signal`), Vue `useWorkingTree()` (`ComputedRef`) — identical field names, method names, and semantics; only the container shape differs. When `RxDBProvider` gets a new database, the fourteen slots return to their initial state and late results from the old database are discarded. The Angular / Vue entries bind to the database at creation time; switching databases means rebuilding the component.

The four rejection causes of `restore()` come back as **return values**, not exceptions, so `restoreState` has **no empty** either: "rejected" and "nothing restored" are results, not "no result". The empty of `restoreSessionState` has exactly one meaning — the current branch has no unfinished restore session; a `conflicted` session is still **not** empty: it still occupies the unique index and still blocks the next restore.

`WorkingTreeSwitchBranchOptions` for `switchBranch(branchId, options?)` comes in via T123: omitting the second argument is byte-for-byte identical to today (unconditional switch); `{ requireClean: true }` against a non-empty working tree **throws** `WorkingTreeDirtyError` — rejection is not a return value because at that moment the branch was not switched at all.
