# getCurrentBranch()

```ts
function getCurrentBranch(rxdb, tableSet?): Promise<RxDBBranch>;
```

Defined in: [packages/rxdb/src/system/system-repositories.ts:136](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system-repositories.ts#L136)

Gets the current branch: the branch held by the table set this instance is attached to; when the main table set has no active branch, activates (or creates) `main`.

## Parameters

| Parameter   | Type                                                 | Default value           | Description                                                                                                                                                                                                                                                                                                                    |
| ----------- | ---------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rxdb`      | [`RxDB`](../classes/RxDB.md)                         | `undefined`             | The RxDB instance                                                                                                                                                                                                                                                                                                              |
| `tableSet?` | [`WorktreeTableSet`](../classes/WorktreeTableSet.md) | `rxdb.worktreeTableSet` | Which table set's held branch to read; defaults to the set this instance is attached to. Entities of QueryCache sync exist only in the main table set, and their changes are recorded under the main checkout's branch name: an outbound queue attached to a writable checkout also reads via the main table set (US-314 B2.1) |

## Returns

`Promise`&lt;[`RxDBBranch`](../classes/RxDBBranch.md)&gt;

## Throws

[RxDBError](../classes/RxDBError.md) when attached to a writable checkout whose table set's held branch is gone

## Remarks

The lookup takes `WorktreeTableSet.heldBranchWhere` (US-314 B1.4): the main table set still queries by `activated` as before.
A shadow table set has no notion of "recovery" — a missing held branch means the checkout is already closed; picking a branch for it would mean moving the writes under another branch's name.
