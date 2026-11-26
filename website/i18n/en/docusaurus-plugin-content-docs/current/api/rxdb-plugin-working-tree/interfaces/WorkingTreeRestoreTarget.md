# WorkingTreeRestoreTarget

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L48)

The restore target: which commit to restore the working tree to, and which of its units.

## Remarks

Wrapped in an object rather than a bare `commitId: string`: `restore()`'s parameter will sooner or later grow a second addressing mode
such as "restore to a point in time", and changing `string` into a union then would ripple through every call site.

`entities` does not conflict with hard ruling 1; the direction is exactly opposite: hard ruling 1 forbids **`commit()` / `discard()`
picking a subset of uncommitted changes** — whatever lies in the working tree is persisted whole or discarded whole. What is picked here is
**what to write into the working tree**; once written, they are part of the whole working tree like any hand-made change, and the next
`commit()` still commits everything (FR-015, last sentence).

## Properties

### commitId \{#commitid\}

```ts
readonly commitId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L50)

The id of the target commit; must be on the reachable parent chain of the current branch HEAD (FR-033)

---

### entities? \{#entities\}

```ts
readonly entities?: readonly WorkingTreeRestoreEntityRef[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L59)

Only restore the units named in the target commit; omitted = all units of the whole commit

#### Remarks

All three parts are given rather than just `entityId`: the same id under two namespaces is two rows,
and filtering by id alone would drag in the row with the same id from the other table.
