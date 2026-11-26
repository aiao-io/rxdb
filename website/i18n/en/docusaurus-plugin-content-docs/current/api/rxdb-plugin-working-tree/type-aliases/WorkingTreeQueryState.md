---
sidebar_label: 'WorkingTreeQueryState⟨T⟩'
---

# WorkingTreeQueryState`<T>`

```ts
type WorkingTreeQueryState<T> =
  | WorkingTreeIdleState
  | WorkingTreeLoadingState
  | WorkingTreeSuccessState<T>
  | WorkingTreeEmptyState<T>
  | WorkingTreeErrorState;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L113)

The observable state of a query: **exactly one more** empty than commands (§4).

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Remarks

Only five things have empty semantics: `status()` with no uncommitted changes, `diff()` with no changes to
show, `listCommits()` with no history, `commitChanges()` with no change units (baseline nodes), and
`restoreSession()` with no unfinished session. The criteria are
[isWorkingTreeStatusEmpty](../functions/isWorkingTreeStatusEmpty.md),
[isWorkingTreeDiffEmpty](../functions/isWorkingTreeDiffEmpty.md),
[isCommitLogPageEmpty](../functions/isCommitLogPageEmpty.md), `isCommitChangeSetPageEmpty()`, and
[isWorkingTreeRestoreSessionEmpty](../functions/isWorkingTreeRestoreSessionEmpty.md).
