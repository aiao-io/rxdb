# WorktreeSnapshotTable

Defined in: [packages/rxdb/src/worktree-snapshot.interface.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/worktree-snapshot.interface.ts#L34)

One table to copy into the snapshot database.

## Properties

### EntityType \{#entitytype\}

```ts
readonly EntityType: EntityType;
```

Defined in: [packages/rxdb/src/worktree-snapshot.interface.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/worktree-snapshot.interface.ts#L36)

The entity class on the snapshot instance: same namespace and same name as the main instance's entity

---

### pages \{#pages\}

```ts
readonly pages: AsyncIterable<WorktreeSnapshotPage>;
```

Defined in: [packages/rxdb/src/worktree-snapshot.interface.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/worktree-snapshot.interface.ts#L38)

The pages read from the main database, in read order
