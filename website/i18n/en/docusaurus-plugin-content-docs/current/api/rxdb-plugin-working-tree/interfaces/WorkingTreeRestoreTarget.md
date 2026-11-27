# WorkingTreeRestoreTarget

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L48)

The restore target: which commit to restore the working tree to, and which of its units.

## Remarks

Collected into an object rather than a bare `commitId: string`: `restore()`'s input is bound to grow a second addressing form like "restore to some point in time", and changing `string` into a union then ripples through every call site.

`entities` does not conflict with hard ruling 1; the directions are exactly opposite: hard ruling 1 forbids **`commit()` / `discard()`** from picking a subset of uncommitted changes — whatever lies in the working tree is landed whole or discarded whole. What is picked here is **what to write into the working tree**, and once written, they are part of the whole working tree just like hand-made changes, and the next `commit()` still commits in full (final sentence of FR-015).

## Properties

### commitId \{#commitid\}

```ts
readonly commitId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L50)

The target commit's id; must be on the current branch HEAD's reachable parent chain (FR-033)

---

### entities? \{#entities\}

```ts
readonly entities?: readonly WorkingTreeRestoreEntityRef[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L59)

Only restore these units named in the target commit; default = all units of the whole commit

#### Remarks

Give all three parts rather than only `entityId`: the same id under two namespaces is two rows, and filtering by id alone drags in the row in the other table that happens to share the id.
