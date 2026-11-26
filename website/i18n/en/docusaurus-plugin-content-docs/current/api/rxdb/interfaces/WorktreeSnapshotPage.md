# WorktreeSnapshotPage

Defined in: [packages/rxdb/src/worktree-snapshot.interface.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/worktree-snapshot.interface.ts#L24)

One page of rows in storage form.

## Properties

### count \{#count\}

```ts
readonly count: number;
```

Defined in: [packages/rxdb/src/worktree-snapshot.interface.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/worktree-snapshot.interface.ts#L28)

The number of rows in this page.

***

### next \{#next\}

```ts
readonly next: 
  | WorktreeSnapshotCursor
  | null;
```

Defined in: [packages/rxdb/src/worktree-snapshot.interface.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/worktree-snapshot.interface.ts#L30)

Where the next page continues reading from; `null` means this table has been fully read.

***

### rows \{#rows\}

```ts
readonly rows: unknown;
```

Defined in: [packages/rxdb/src/worktree-snapshot.interface.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/worktree-snapshot.interface.ts#L26)

This page's rows; the shape is only recognized by the kind of adapter that read them.
