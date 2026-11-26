# WorktreeOptions

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-options.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-options.ts#L20)

Options for read-only checkouts.

## Properties

### adapter \{#adapter\}

```ts
readonly adapter: AdapterFactory;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-options.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-options.ts#L22)

The adapter factory for the snapshot database, see [WorktreeAdapterFactory](../type-aliases/WorktreeAdapterFactory.md)

---

### plugins? \{#plugins\}

```ts
readonly plugins?: readonly Plugin[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-options.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-options.ts#L30)

Read-side plugins installed on the snapshot instance (such as tree, graph).

#### Remarks

Entity-class-generating plugins must match the main instance, otherwise the tables they generate have no corresponding class on the snapshot instance and opening fails with `incomplete_entities`.
Do not install write-side plugins (history, sync, workspace, working tree, storage, search): on a read-only instance they have nothing to do, and some need to write to the database.
