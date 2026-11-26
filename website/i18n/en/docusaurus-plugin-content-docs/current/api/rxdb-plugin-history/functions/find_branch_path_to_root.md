# find_branch_path_to_root()

```ts
function find_branch_path_to_root(branch, branchMap): RxDBBranch[];
```

Defined in: [packages/rxdb-plugin-history/src/find-switch-branch-step.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/find-switch-branch-step.ts#L96)

**`Internal`**

Walks `parentId` from a branch to the root of its tree, returning all branches passed through (including itself, with the root last).

A broken chain (`parentId` pointing at no branch) and a cycle are both **persistence integrity errors**: the branch set the caller passes in
is the result of an unfiltered full query, so there is no legitimate "the parent was filtered out" case.
Both used to be a `break` — treating bad data as "already at the root", continuing to compute a complete action sequence toward
a root that does not exist, with the caller writing it all to the database and half the path applied without any error.
A failed branch switch is far better than silently switching wrong, so this must abort without producing any actions.

Extracted from [find\_switch\_branch\_step](find_switch_branch_step.md)'s closure into a module-level export because
the answer to "is the parent chain self-consistent" must be **globally unique**: `enable-migration.ts`'s
"can this branch be fully materialized" check uses it (research.md R11). Left in the closure it is unreachable,
and callers would have to write their own traversal, giving the migration phase and the runtime phase two different answers for the same database.

It **cannot reach** [find\_switch\_branch\_step](find_switch_branch_step.md)'s two early returns: when the change ids are equal (including when both sides
have no changes and both sit at the root) that function returns empty steps immediately and never gets here. So a caller that needs to check parent-chain
integrity must call it **itself** and cannot expect `find_switch_branch_step` to check it on the way.

## Parameters

| Parameter   | Type                                                                            | Description                              |
| ----------- | ------------------------------------------------------------------------------- | ---------------------------------------- |
| `branch`    | [`RxDBBranch`](../../rxdb/classes/RxDBBranch.md)                                | The start branch                         |
| `branchMap` | `ReadonlyMap`&lt;`string`, [`RxDBBranch`](../../rxdb/classes/RxDBBranch.md)&gt; | Branch id → branch; must be the full set |

## Returns

[`RxDBBranch`](../../rxdb/classes/RxDBBranch.md)[]

The path from `branch` to the root, with `branch` at position 0

## Throws

RxDBError When the parent chain has a cycle or points at a nonexistent branch
