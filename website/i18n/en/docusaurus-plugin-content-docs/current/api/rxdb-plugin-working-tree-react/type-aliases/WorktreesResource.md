# WorktreesResource

```ts
type WorktreesResource = Readonly<WorktreeAsyncStates> & WorktreeCommands & object;
```

Defined in: [use-worktrees.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-react/src/use-worktrees.ts#L77)

The checkout entry returned by [useWorktrees](../functions/useWorktrees.md) in the current render (read-only checkouts US-313, writable checkouts US-314).

## Type Declaration

### mounted

```ts
readonly mounted: WorktreeTableSet;
```

The table set this instance is currently mounted on; changes only after a remount settles, and is a new instance with the same suffix after rebuild

## Remarks

The ten state fields map one-to-one to core's `WorktreeAsyncStates`, and the method signatures match the same-named methods on the plugin package's `WorktreeManager`. Method references are stable (the same closure set is reused across renders for the same database), while state fields produce new objects on phase changes. Same name, same fields, same signatures across all three frameworks: Angular `useWorktrees()` (`Signal`), Vue `useWorktrees()` (`ComputedRef`). When `RxDBProvider` gets a new database, the ten slots return to their initial state and `mounted` becomes the new database's; late results from the old database are discarded. The Angular / Vue entries bind to the database at creation time; switching databases means rebuilding the component.

`mounted` is the table set this instance is currently mounted on (`rxdb.worktreeTableSet$`; it only changes after the remount settles and the entity caches are cleared): `mounted.isMain` means mounted on the main checkout; among the writable checkout registry rows, the one with `tableSetSuffix === mounted.suffix` is the mounted one, and the current branch is the entry whose `activeKey === mounted.holderKey`. After a remount, `useWorkingTree()`'s slots don't re-read on their own; components that need to follow should subscribe to `mounted` and re-read.

The view obtained from opening hands `view.rxdb` to `RxDBProvider`; existing query hooks work as usual. Queries should use the classes swapped via `view.entityOf()`.
