# ACTIVE_BRANCH_KEY

```ts
const ACTIVE_BRANCH_KEY: "*active*" = '*active*';
```

Defined in: [packages/rxdb/src/system/active-branch-guard.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/active-branch-guard.ts#L54)

Sentinel value written into the `activeKey` column of the active branch.

## Remarks

It is a **constant**, not a branch id. Storing the id would give "who is active" two separate spellings (data-model.md §2.2 explicitly forbids duplicating the active branch ID), and the unique constraint would immediately degrade into "each branch can be activated at most once" — two branches active at the same time would still be writable, making the constraint worthless.

The value has a shape that can never collide with a branch id: branch ids are user-named, and `*` is not a legal naming character.

Other non-null values in this column are hold keys of writable checkouts, not sentinels (see [WorktreeBranchHeldError](../classes/WorktreeBranchHeldError.md)). So "clear the old sentinel" must clear by value (`activeKey = sentinel`), not by "non-null" — the latter would wipe hold keys along with it.
