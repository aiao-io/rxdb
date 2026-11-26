# CommitLogEntry

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-log.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-log.ts#L60)

One commit node in the history.

## Remarks

The fields are **a subset** of the `Commit` entity's columns: `operationId` and `contentFingerprint` are deliberately kept out (see this file's header). `id` is renamed to `commitId` and `author` to `authorId`, aligning with CommitResult.commitId and [CommitOptions.authorId](CommitOptions.md#authorid) — one concept should have exactly one name on the public surface.

## Properties

### authorId \{#authorid\}

```ts
readonly authorId: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-log.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-log.ts#L77)

The committer; `null` when not recorded

***

### changeSetCount \{#changesetcount\}

```ts
readonly changeSetCount: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-log.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-log.ts#L83)

The number of change units in this commit

***

### commitId \{#commitid\}

```ts
readonly commitId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-log.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-log.ts#L62)

The commit id

***

### createdAt \{#createdat\}

```ts
readonly createdAt: Date;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-log.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-log.ts#L80)

The database time

***

### firstParentId \{#firstparentid\}

```ts
readonly firstParentId: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-log.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-log.ts#L68)

The first parent; `null` for the root node

***

### kind \{#kind\}

```ts
readonly kind: CommitKind;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-log.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-log.ts#L71)

The commit kind; `baseline` / `branch_baseline` are system root nodes, not user commits

***

### message \{#message\}

```ts
readonly message: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-log.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-log.ts#L74)

The commit message

***

### parentIds \{#parentids\}

```ts
readonly parentIds: readonly string[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-log.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-log.ts#L65)

All parents, in write order; an empty array for the root node, multiple for a merge
