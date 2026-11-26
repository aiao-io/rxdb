# WorktreeSnapshotImport

Defined in: [packages/rxdb/src/worktree-snapshot.interface.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/worktree-snapshot.interface.ts#L42)

One snapshot import: the tables to copy, and the increments applied on top of the copied rows.

## Properties

### actions \{#actions\}

```ts
readonly actions: SwitchVersionActions;
```

Defined in: [packages/rxdb/src/worktree-snapshot.interface.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/worktree-snapshot.interface.ts#L51)

The increments leading from the primary database's current active branch to the target point.

#### Remarks

The patches are in the change log's storage form; encrypted columns are envelopes; contains only entities present on the snapshot instance.

---

### tables \{#tables\}

```ts
readonly tables: readonly WorktreeSnapshotTable[];
```

Defined in: [packages/rxdb/src/worktree-snapshot.interface.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/worktree-snapshot.interface.ts#L44)

The tables to copy
